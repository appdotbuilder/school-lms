
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, classesTable, assignmentsTable, quizQuestionsTable, submissionsTable, quizAnswersTable, classEnrollmentsTable } from '../db/schema';
import { type CreateQuizQuestionInput } from '../schema';
import { 
  createQuizQuestion, 
  getQuizQuestions, 
  updateQuizQuestion, 
  deleteQuizQuestion, 
  submitQuizAnswers, 
  getQuizResults 
} from '../handlers/quizzes';
import { eq, and } from 'drizzle-orm';

describe('Quiz Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let teacherId: number;
  let studentId: number;
  let classId: number;
  let assignmentId: number;

  beforeEach(async () => {
    // Create test teacher
    const teacherResult = await db.insert(usersTable)
      .values({
        email: 'teacher@test.com',
        password_hash: 'hashed_password',
        first_name: 'Teacher',
        last_name: 'User',
        role: 'teacher'
      })
      .returning()
      .execute();
    teacherId = teacherResult[0].id;

    // Create test student
    const studentResult = await db.insert(usersTable)
      .values({
        email: 'student@test.com',
        password_hash: 'hashed_password',
        first_name: 'Student',
        last_name: 'User',
        role: 'student'
      })
      .returning()
      .execute();
    studentId = studentResult[0].id;

    // Create test class
    const classResult = await db.insert(classesTable)
      .values({
        name: 'Test Class',
        class_code: 'TEST123',
        teacher_id: teacherId
      })
      .returning()
      .execute();
    classId = classResult[0].id;

    // Enroll student in class
    await db.insert(classEnrollmentsTable)
      .values({
        user_id: studentId,
        class_id: classId
      })
      .execute();

    // Create test assignment
    const assignmentResult = await db.insert(assignmentsTable)
      .values({
        title: 'Test Quiz',
        type: 'quiz',
        class_id: classId,
        teacher_id: teacherId
      })
      .returning()
      .execute();
    assignmentId = assignmentResult[0].id;
  });

  describe('createQuizQuestion', () => {
    it('should create a quiz question', async () => {
      const testInput: CreateQuizQuestionInput = {
        assignment_id: assignmentId,
        question_text: 'What is 2 + 2?',
        question_type: 'multiple_choice',
        correct_answer: '4',
        answer_choices: JSON.stringify(['2', '3', '4', '5']),
        points: 2,
        order_index: 1
      };
      
      const result = await createQuizQuestion(testInput);

      expect(result.question_text).toEqual('What is 2 + 2?');
      expect(result.question_type).toEqual('multiple_choice');
      expect(result.correct_answer).toEqual('4');
      expect(result.points).toEqual(2);
      expect(result.order_index).toEqual(1);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save question to database', async () => {
      const testInput: CreateQuizQuestionInput = {
        assignment_id: assignmentId,
        question_text: 'What is 2 + 2?',
        question_type: 'multiple_choice',
        correct_answer: '4',
        answer_choices: JSON.stringify(['2', '3', '4', '5']),
        points: 2,
        order_index: 1
      };
      
      const result = await createQuizQuestion(testInput);

      const questions = await db.select()
        .from(quizQuestionsTable)
        .where(eq(quizQuestionsTable.id, result.id))
        .execute();

      expect(questions).toHaveLength(1);
      expect(questions[0].question_text).toEqual('What is 2 + 2?');
      expect(questions[0].assignment_id).toEqual(assignmentId);
    });

    it('should throw error for non-existent assignment', async () => {
      const testInput: CreateQuizQuestionInput = {
        assignment_id: 99999,
        question_text: 'What is 2 + 2?',
        question_type: 'multiple_choice',
        correct_answer: '4',
        answer_choices: JSON.stringify(['2', '3', '4', '5']),
        points: 2,
        order_index: 1
      };

      expect(createQuizQuestion(testInput)).rejects.toThrow(/assignment not found/i);
    });
  });

  describe('getQuizQuestions', () => {
    let questionId: number;

    beforeEach(async () => {
      const questionResult = await db.insert(quizQuestionsTable)
        .values({
          assignment_id: assignmentId,
          question_text: 'Test question',
          question_type: 'multiple_choice',
          correct_answer: 'correct',
          points: 1,
          order_index: 1
        })
        .returning()
        .execute();
      questionId = questionResult[0].id;
    });

    it('should return questions for teacher with correct answers', async () => {
      const questions = await getQuizQuestions(assignmentId, teacherId);

      expect(questions).toHaveLength(1);
      expect(questions[0].question_text).toEqual('Test question');
      expect(questions[0].correct_answer).toEqual('correct');
    });

    it('should return questions for student without correct answers', async () => {
      const questions = await getQuizQuestions(assignmentId, studentId);

      expect(questions).toHaveLength(1);
      expect(questions[0].question_text).toEqual('Test question');
      expect(questions[0].correct_answer).toBeNull();
    });

    it('should throw error for non-enrolled student', async () => {
      // Create another student not enrolled in class
      const otherStudentResult = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hash',
          first_name: 'Other',
          last_name: 'Student',
          role: 'student'
        })
        .returning()
        .execute();

      expect(getQuizQuestions(assignmentId, otherStudentResult[0].id)).rejects.toThrow(/access denied/i);
    });
  });

  describe('updateQuizQuestion', () => {
    let questionId: number;

    beforeEach(async () => {
      const questionResult = await db.insert(quizQuestionsTable)
        .values({
          assignment_id: assignmentId,
          question_text: 'Original question',
          question_type: 'multiple_choice',
          correct_answer: 'original',
          points: 1,
          order_index: 1
        })
        .returning()
        .execute();
      questionId = questionResult[0].id;
    });

    it('should update quiz question', async () => {
      const updateData = {
        question_text: 'Updated question',
        points: 3
      };

      const result = await updateQuizQuestion(questionId, updateData, teacherId);

      expect(result.question_text).toEqual('Updated question');
      expect(result.points).toEqual(3);
      expect(result.question_type).toEqual('multiple_choice'); // Unchanged
    });

    it('should throw error for non-owner teacher', async () => {
      // Create another teacher
      const otherTeacherResult = await db.insert(usersTable)
        .values({
          email: 'other@teacher.com',
          password_hash: 'hash',
          first_name: 'Other',
          last_name: 'Teacher',
          role: 'teacher'
        })
        .returning()
        .execute();

      expect(updateQuizQuestion(questionId, { question_text: 'Updated' }, otherTeacherResult[0].id))
        .rejects.toThrow(/access denied/i);
    });
  });

  describe('deleteQuizQuestion', () => {
    let question1Id: number;
    let question2Id: number;
    let question3Id: number;

    beforeEach(async () => {
      // Create multiple questions with different order_index
      const q1 = await db.insert(quizQuestionsTable)
        .values({
          assignment_id: assignmentId,
          question_text: 'Question 1',
          question_type: 'multiple_choice',
          points: 1,
          order_index: 1
        })
        .returning()
        .execute();
      question1Id = q1[0].id;

      const q2 = await db.insert(quizQuestionsTable)
        .values({
          assignment_id: assignmentId,
          question_text: 'Question 2',
          question_type: 'multiple_choice',
          points: 1,
          order_index: 2
        })
        .returning()
        .execute();
      question2Id = q2[0].id;

      const q3 = await db.insert(quizQuestionsTable)
        .values({
          assignment_id: assignmentId,
          question_text: 'Question 3',
          question_type: 'multiple_choice',
          points: 1,
          order_index: 3
        })
        .returning()
        .execute();
      question3Id = q3[0].id;
    });

    it('should delete question and reorder remaining', async () => {
      await deleteQuizQuestion(question2Id, teacherId);

      // Check question is deleted
      const deletedQuestion = await db.select()
        .from(quizQuestionsTable)
        .where(eq(quizQuestionsTable.id, question2Id))
        .execute();
      expect(deletedQuestion).toHaveLength(0);

      // Check remaining questions are reordered
      const remainingQuestions = await db.select()
        .from(quizQuestionsTable)
        .where(eq(quizQuestionsTable.assignment_id, assignmentId))
        .orderBy(quizQuestionsTable.order_index)
        .execute();

      expect(remainingQuestions).toHaveLength(2);
      expect(remainingQuestions[0].id).toEqual(question1Id);
      expect(remainingQuestions[0].order_index).toEqual(1);
      expect(remainingQuestions[1].id).toEqual(question3Id);
      expect(remainingQuestions[1].order_index).toEqual(2); // Reordered from 3 to 2
    });

    it('should throw error for non-owner teacher', async () => {
      const otherTeacherResult = await db.insert(usersTable)
        .values({
          email: 'other@teacher.com',
          password_hash: 'hash',
          first_name: 'Other',
          last_name: 'Teacher',
          role: 'teacher'
        })
        .returning()
        .execute();

      expect(deleteQuizQuestion(question1Id, otherTeacherResult[0].id))
        .rejects.toThrow(/access denied/i);
    });
  });

  describe('submitQuizAnswers', () => {
    let submissionId: number;
    let questionId: number;

    beforeEach(async () => {
      // Create submission
      const submissionResult = await db.insert(submissionsTable)
        .values({
          assignment_id: assignmentId,
          student_id: studentId,
          status: 'pending'
        })
        .returning()
        .execute();
      submissionId = submissionResult[0].id;

      // Create question
      const questionResult = await db.insert(quizQuestionsTable)
        .values({
          assignment_id: assignmentId,
          question_text: 'What is 2 + 2?',
          question_type: 'multiple_choice',
          correct_answer: '4',
          points: 2,
          order_index: 1
        })
        .returning()
        .execute();
      questionId = questionResult[0].id;
    });

    it('should submit quiz answers and auto-score', async () => {
      const answers = [
        { questionId, answerText: '4' } // Correct answer
      ];

      await submitQuizAnswers(submissionId, answers);

      // Check answer was saved
      const savedAnswers = await db.select()
        .from(quizAnswersTable)
        .where(eq(quizAnswersTable.submission_id, submissionId))
        .execute();

      expect(savedAnswers).toHaveLength(1);
      expect(savedAnswers[0].answer_text).toEqual('4');
      expect(savedAnswers[0].is_correct).toBe(true);
      expect(savedAnswers[0].points_earned).toEqual(2);

      // Check submission was updated
      const submission = await db.select()
        .from(submissionsTable)
        .where(eq(submissionsTable.id, submissionId))
        .execute();

      expect(submission[0].points_earned).toEqual(2);
      expect(submission[0].status).toEqual('submitted');
      expect(submission[0].submitted_at).toBeInstanceOf(Date);
    });

    it('should handle incorrect answers', async () => {
      const answers = [
        { questionId, answerText: '5' } // Incorrect answer
      ];

      await submitQuizAnswers(submissionId, answers);

      const savedAnswers = await db.select()
        .from(quizAnswersTable)
        .where(eq(quizAnswersTable.submission_id, submissionId))
        .execute();

      expect(savedAnswers[0].is_correct).toBe(false);
      expect(savedAnswers[0].points_earned).toEqual(0);
    });
  });

  describe('getQuizResults', () => {
    let submissionId: number;
    let questionId: number;

    beforeEach(async () => {
      // Create submission
      const submissionResult = await db.insert(submissionsTable)
        .values({
          assignment_id: assignmentId,
          student_id: studentId,
          status: 'submitted',
          points_earned: 2,
          submitted_at: new Date()
        })
        .returning()
        .execute();
      submissionId = submissionResult[0].id;

      // Create question
      const questionResult = await db.insert(quizQuestionsTable)
        .values({
          assignment_id: assignmentId,
          question_text: 'Test Question',
          question_type: 'multiple_choice',
          correct_answer: '4',
          points: 2,
          order_index: 1
        })
        .returning()
        .execute();
      questionId = questionResult[0].id;

      // Create answer
      await db.insert(quizAnswersTable)
        .values({
          submission_id: submissionId,
          question_id: questionId,
          answer_text: '4',
          is_correct: true,
          points_earned: 2
        })
        .execute();
    });

    it('should return quiz results for teacher', async () => {
      const results = await getQuizResults(assignmentId, teacherId);

      expect(results).toHaveLength(1);
      expect(results[0].student.first_name).toEqual('Student');
      expect(results[0].submission.points_earned).toEqual(2);
      expect(results[0].answers).toHaveLength(1);
      expect(results[0].answers[0].answer.answer_text).toEqual('4');
      expect(results[0].answers[0].answer.is_correct).toBe(true);
    });

    it('should throw error for non-owner teacher', async () => {
      const otherTeacherResult = await db.insert(usersTable)
        .values({
          email: 'other@teacher.com',
          password_hash: 'hash',
          first_name: 'Other',
          last_name: 'Teacher',
          role: 'teacher'
        })
        .returning()
        .execute();

      expect(getQuizResults(assignmentId, otherTeacherResult[0].id))
        .rejects.toThrow(/access denied/i);
    });
  });
});
