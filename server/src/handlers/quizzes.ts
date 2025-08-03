
import { db } from '../db';
import { quizQuestionsTable, assignmentsTable, submissionsTable, quizAnswersTable, usersTable, classesTable, classEnrollmentsTable } from '../db/schema';
import { type CreateQuizQuestionInput, type QuizQuestion } from '../schema';
import { eq, and, asc, desc, gt, sql } from 'drizzle-orm';

export async function createQuizQuestion(input: CreateQuizQuestionInput): Promise<QuizQuestion> {
  try {
    // Verify assignment exists and get teacher ID
    const assignment = await db.select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, input.assignment_id))
      .execute();

    if (assignment.length === 0) {
      throw new Error('Assignment not found');
    }

    // Insert quiz question
    const result = await db.insert(quizQuestionsTable)
      .values({
        assignment_id: input.assignment_id,
        question_text: input.question_text,
        question_type: input.question_type,
        correct_answer: input.correct_answer || null,
        answer_choices: input.answer_choices || null,
        points: input.points || 1,
        order_index: input.order_index
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Quiz question creation failed:', error);
    throw error;
  }
}

export async function getQuizQuestions(assignmentId: number, userId: number): Promise<QuizQuestion[]> {
  try {
    // Verify user has access to assignment (is teacher or enrolled student)
    const accessQuery = await db.select({
      assignment: assignmentsTable,
      class: classesTable
    })
      .from(assignmentsTable)
      .innerJoin(classesTable, eq(assignmentsTable.class_id, classesTable.id))
      .where(eq(assignmentsTable.id, assignmentId))
      .execute();

    if (accessQuery.length === 0) {
      throw new Error('Assignment not found');
    }

    const assignment = accessQuery[0].assignment;
    const classInfo = accessQuery[0].class;

    // Check if user is teacher or enrolled student
    const isTeacher = assignment.teacher_id === userId;
    
    if (!isTeacher) {
      // Check if student is enrolled in class
      const enrollmentCheck = await db.select()
        .from(classEnrollmentsTable)
        .where(and(
          eq(classEnrollmentsTable.user_id, userId),
          eq(classEnrollmentsTable.class_id, classInfo.id)
        ))
        .execute();

      if (enrollmentCheck.length === 0) {
        throw new Error('Access denied');
      }
    }

    // Get quiz questions ordered by order_index
    const questions = await db.select()
      .from(quizQuestionsTable)
      .where(eq(quizQuestionsTable.assignment_id, assignmentId))
      .orderBy(asc(quizQuestionsTable.order_index))
      .execute();

    // For students, filter out correct answers for objective questions
    if (!isTeacher) {
      return questions.map(question => ({
        ...question,
        correct_answer: null // Hide correct answers from students
      }));
    }

    return questions;
  } catch (error) {
    console.error('Failed to get quiz questions:', error);
    throw error;
  }
}

export async function updateQuizQuestion(questionId: number, input: Partial<CreateQuizQuestionInput>, teacherId: number): Promise<QuizQuestion> {
  try {
    // Verify question exists and teacher owns the assignment
    const questionQuery = await db.select({
      question: quizQuestionsTable,
      assignment: assignmentsTable
    })
      .from(quizQuestionsTable)
      .innerJoin(assignmentsTable, eq(quizQuestionsTable.assignment_id, assignmentsTable.id))
      .where(eq(quizQuestionsTable.id, questionId))
      .execute();

    if (questionQuery.length === 0) {
      throw new Error('Quiz question not found');
    }

    const assignment = questionQuery[0].assignment;
    if (assignment.teacher_id !== teacherId) {
      throw new Error('Access denied - not assignment owner');
    }

    // Build update object only with provided fields
    const updateData: any = {};
    if (input.question_text !== undefined) updateData.question_text = input.question_text;
    if (input.question_type !== undefined) updateData.question_type = input.question_type;
    if (input.correct_answer !== undefined) updateData.correct_answer = input.correct_answer;
    if (input.answer_choices !== undefined) updateData.answer_choices = input.answer_choices;
    if (input.points !== undefined) updateData.points = input.points;
    if (input.order_index !== undefined) updateData.order_index = input.order_index;

    const result = await db.update(quizQuestionsTable)
      .set(updateData)
      .where(eq(quizQuestionsTable.id, questionId))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Quiz question update failed:', error);
    throw error;
  }
}

export async function deleteQuizQuestion(questionId: number, teacherId: number): Promise<void> {
  try {
    // Verify question exists and teacher owns the assignment
    const questionQuery = await db.select({
      question: quizQuestionsTable,
      assignment: assignmentsTable
    })
      .from(quizQuestionsTable)
      .innerJoin(assignmentsTable, eq(quizQuestionsTable.assignment_id, assignmentsTable.id))
      .where(eq(quizQuestionsTable.id, questionId))
      .execute();

    if (questionQuery.length === 0) {
      throw new Error('Quiz question not found');
    }

    const question = questionQuery[0].question;
    const assignment = questionQuery[0].assignment;
    
    if (assignment.teacher_id !== teacherId) {
      throw new Error('Access denied - not assignment owner');
    }

    // Delete the question
    await db.delete(quizQuestionsTable)
      .where(eq(quizQuestionsTable.id, questionId))
      .execute();

    // Reorder remaining questions - decrease order_index for questions after the deleted one
    await db.update(quizQuestionsTable)
      .set({
        order_index: sql`${quizQuestionsTable.order_index} - 1`
      })
      .where(and(
        eq(quizQuestionsTable.assignment_id, question.assignment_id),
        gt(quizQuestionsTable.order_index, question.order_index)
      ))
      .execute();
  } catch (error) {
    console.error('Quiz question deletion failed:', error);
    throw error;
  }
}

export async function submitQuizAnswers(submissionId: number, answers: Array<{ questionId: number; answerText: string }>): Promise<void> {
  try {
    // Verify submission exists and belongs to the student
    const submission = await db.select()
      .from(submissionsTable)
      .where(eq(submissionsTable.id, submissionId))
      .execute();

    if (submission.length === 0) {
      throw new Error('Submission not found');
    }

    let totalPointsEarned = 0;

    // Process each answer
    for (const answer of answers) {
      // Get question details
      const question = await db.select()
        .from(quizQuestionsTable)
        .where(eq(quizQuestionsTable.id, answer.questionId))
        .execute();

      if (question.length === 0) {
        continue; // Skip invalid question IDs
      }

      const questionData = question[0];
      let isCorrect = false;
      let pointsEarned = 0;

      // Auto-score objective questions
      if (questionData.correct_answer && questionData.question_type !== 'essay') {
        isCorrect = answer.answerText.toLowerCase().trim() === questionData.correct_answer.toLowerCase().trim();
        pointsEarned = isCorrect ? questionData.points : 0;
        totalPointsEarned += pointsEarned;
      }

      // Check if answer already exists and delete it first
      await db.delete(quizAnswersTable)
        .where(and(
          eq(quizAnswersTable.submission_id, submissionId),
          eq(quizAnswersTable.question_id, answer.questionId)
        ))
        .execute();

      // Insert new answer
      await db.insert(quizAnswersTable)
        .values({
          submission_id: submissionId,
          question_id: answer.questionId,
          answer_text: answer.answerText,
          is_correct: questionData.question_type === 'essay' ? null : isCorrect,
          points_earned: pointsEarned
        })
        .execute();
    }

    // Update submission with total points (only for auto-scorable questions)
    await db.update(submissionsTable)
      .set({
        points_earned: totalPointsEarned,
        status: 'submitted',
        submitted_at: new Date()
      })
      .where(eq(submissionsTable.id, submissionId))
      .execute();
  } catch (error) {
    console.error('Quiz answer submission failed:', error);
    throw error;
  }
}

export async function getQuizResults(assignmentId: number, teacherId: number): Promise<any[]> {
  try {
    // Verify teacher owns the assignment
    const assignment = await db.select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, assignmentId))
      .execute();

    if (assignment.length === 0) {
      throw new Error('Assignment not found');
    }

    if (assignment[0].teacher_id !== teacherId) {
      throw new Error('Access denied - not assignment owner');
    }

    // Get all submissions with student info and quiz answers
    const results = await db.select({
      submission: submissionsTable,
      student: usersTable,
      answer: quizAnswersTable,
      question: quizQuestionsTable
    })
      .from(submissionsTable)
      .innerJoin(usersTable, eq(submissionsTable.student_id, usersTable.id))
      .leftJoin(quizAnswersTable, eq(quizAnswersTable.submission_id, submissionsTable.id))
      .leftJoin(quizQuestionsTable, eq(quizAnswersTable.question_id, quizQuestionsTable.id))
      .where(eq(submissionsTable.assignment_id, assignmentId))
      .orderBy(desc(submissionsTable.submitted_at))
      .execute();

    // Group results by submission
    const groupedResults = results.reduce((acc, result) => {
      const submissionId = result.submission.id;
      
      if (!acc[submissionId]) {
        acc[submissionId] = {
          submission: result.submission,
          student: {
            id: result.student.id,
            first_name: result.student.first_name,
            last_name: result.student.last_name,
            email: result.student.email
          },
          answers: []
        };
      }

      if (result.answer && result.question) {
        acc[submissionId].answers.push({
          question: result.question,
          answer: result.answer
        });
      }

      return acc;
    }, {} as any);

    return Object.values(groupedResults);
  } catch (error) {
    console.error('Failed to get quiz results:', error);
    throw error;
  }
}
