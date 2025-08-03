
import { db } from '../db';
import { submissionsTable, assignmentsTable, classesTable, classEnrollmentsTable, gradebookTable, notificationsTable } from '../db/schema';
import { type CreateSubmissionInput, type Submission, type GradeSubmissionInput } from '../schema';
import { eq, and, or, isNull } from 'drizzle-orm';

export async function createSubmission(input: CreateSubmissionInput, studentId: number): Promise<Submission> {
  try {
    // First verify the assignment exists and get its details
    const assignments = await db.select()
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, input.assignment_id))
      .execute();

    if (assignments.length === 0) {
      throw new Error('Assignment not found');
    }

    const assignment = assignments[0];

    // Verify student is enrolled in the class
    const enrollments = await db.select()
      .from(classEnrollmentsTable)
      .where(
        and(
          eq(classEnrollmentsTable.user_id, studentId),
          eq(classEnrollmentsTable.class_id, assignment.class_id)
        )
      )
      .execute();

    if (enrollments.length === 0) {
      throw new Error('Student not enrolled in class');
    }

    // Check if submission already exists
    const existingSubmissions = await db.select()
      .from(submissionsTable)
      .where(
        and(
          eq(submissionsTable.assignment_id, input.assignment_id),
          eq(submissionsTable.student_id, studentId)
        )
      )
      .execute();

    let result;
    const now = new Date();

    if (existingSubmissions.length > 0) {
      // Update existing submission
      const updateResult = await db.update(submissionsTable)
        .set({
          content: input.content || null,
          status: 'submitted',
          submitted_at: now,
          updated_at: now
        })
        .where(eq(submissionsTable.id, existingSubmissions[0].id))
        .returning()
        .execute();

      result = updateResult[0];
    } else {
      // Create new submission
      const insertResult = await db.insert(submissionsTable)
        .values({
          assignment_id: input.assignment_id,
          student_id: studentId,
          content: input.content || null,
          status: 'submitted',
          submitted_at: now
        })
        .returning()
        .execute();

      result = insertResult[0];
    }

    return result;
  } catch (error) {
    console.error('Submission creation failed:', error);
    throw error;
  }
}

export async function getSubmissionsByAssignment(assignmentId: number, teacherId: number): Promise<Submission[]> {
  try {
    // Verify teacher owns the assignment
    const assignments = await db.select()
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.id, assignmentId),
          eq(assignmentsTable.teacher_id, teacherId)
        )
      )
      .execute();

    if (assignments.length === 0) {
      throw new Error('Assignment not found or not owned by teacher');
    }

    // Get all submissions for the assignment
    const submissions = await db.select()
      .from(submissionsTable)
      .where(eq(submissionsTable.assignment_id, assignmentId))
      .execute();

    return submissions;
  } catch (error) {
    console.error('Failed to get submissions by assignment:', error);
    throw error;
  }
}

export async function getSubmissionByStudent(assignmentId: number, studentId: number): Promise<Submission | null> {
  try {
    const submissions = await db.select()
      .from(submissionsTable)
      .where(
        and(
          eq(submissionsTable.assignment_id, assignmentId),
          eq(submissionsTable.student_id, studentId)
        )
      )
      .execute();

    return submissions.length > 0 ? submissions[0] : null;
  } catch (error) {
    console.error('Failed to get submission by student:', error);
    throw error;
  }
}

export async function gradeSubmission(input: GradeSubmissionInput, teacherId: number): Promise<Submission> {
  try {
    // Verify submission exists and get assignment details
    const submissionResults = await db.select({
      submission: submissionsTable,
      assignment: assignmentsTable
    })
      .from(submissionsTable)
      .innerJoin(assignmentsTable, eq(submissionsTable.assignment_id, assignmentsTable.id))
      .where(eq(submissionsTable.id, input.submission_id))
      .execute();

    if (submissionResults.length === 0) {
      throw new Error('Submission not found');
    }

    const { submission, assignment } = submissionResults[0];

    // Verify teacher owns the assignment
    if (assignment.teacher_id !== teacherId) {
      throw new Error('Teacher not authorized to grade this submission');
    }

    const now = new Date();

    // Update submission with grade
    const updatedSubmissions = await db.update(submissionsTable)
      .set({
        status: 'graded',
        points_earned: input.points_earned,
        grade_feedback: input.grade_feedback || null,
        graded_at: now,
        graded_by: teacherId,
        updated_at: now
      })
      .where(eq(submissionsTable.id, input.submission_id))
      .returning()
      .execute();

    const updatedSubmission = updatedSubmissions[0];

    // Update or create gradebook entry
    const existingGradebook = await db.select()
      .from(gradebookTable)
      .where(
        and(
          eq(gradebookTable.student_id, submission.student_id),
          eq(gradebookTable.assignment_id, assignment.id)
        )
      )
      .execute();

    const pointsPossible = assignment.max_points || 100;
    const percentage = Math.round((input.points_earned / pointsPossible) * 100);

    if (existingGradebook.length > 0) {
      await db.update(gradebookTable)
        .set({
          points_earned: input.points_earned,
          points_possible: pointsPossible,
          percentage: percentage,
          updated_at: now
        })
        .where(eq(gradebookTable.id, existingGradebook[0].id))
        .execute();
    } else {
      await db.insert(gradebookTable)
        .values({
          student_id: submission.student_id,
          class_id: assignment.class_id,
          assignment_id: assignment.id,
          points_earned: input.points_earned,
          points_possible: pointsPossible,
          percentage: percentage
        })
        .execute();
    }

    // Create notification for student
    await db.insert(notificationsTable)
      .values({
        user_id: submission.student_id,
        title: 'Assignment Graded',
        message: `Your submission for "${assignment.title}" has been graded.`,
        type: 'grade_received',
        class_id: assignment.class_id,
        assignment_id: assignment.id
      })
      .execute();

    return updatedSubmission;
  } catch (error) {
    console.error('Grading submission failed:', error);
    throw error;
  }
}

export async function getPendingSubmissions(teacherId: number): Promise<Submission[]> {
  try {
    // Get all submissions for assignments created by the teacher that are not graded
    const submissions = await db.select({
      submission: submissionsTable
    })
      .from(submissionsTable)
      .innerJoin(assignmentsTable, eq(submissionsTable.assignment_id, assignmentsTable.id))
      .where(
        and(
          eq(assignmentsTable.teacher_id, teacherId),
          or(
            eq(submissionsTable.status, 'submitted'),
            eq(submissionsTable.status, 'pending')
          )
        )
      )
      .execute();

    return submissions.map(result => result.submission);
  } catch (error) {
    console.error('Failed to get pending submissions:', error);
    throw error;
  }
}

export async function returnSubmissionForRevision(submissionId: number, feedback: string, teacherId: number): Promise<Submission> {
  try {
    // Verify submission exists and teacher has permission
    const submissionResults = await db.select({
      submission: submissionsTable,
      assignment: assignmentsTable
    })
      .from(submissionsTable)
      .innerJoin(assignmentsTable, eq(submissionsTable.assignment_id, assignmentsTable.id))
      .where(eq(submissionsTable.id, submissionId))
      .execute();

    if (submissionResults.length === 0) {
      throw new Error('Submission not found');
    }

    const { submission, assignment } = submissionResults[0];

    // Verify teacher owns the assignment
    if (assignment.teacher_id !== teacherId) {
      throw new Error('Teacher not authorized to return this submission');
    }

    const now = new Date();

    // Update submission status to returned with feedback
    const updatedSubmissions = await db.update(submissionsTable)
      .set({
        status: 'returned',
        grade_feedback: feedback,
        graded_by: teacherId,
        updated_at: now
      })
      .where(eq(submissionsTable.id, submissionId))
      .returning()
      .execute();

    const updatedSubmission = updatedSubmissions[0];

    // Create notification for student
    await db.insert(notificationsTable)
      .values({
        user_id: submission.student_id,
        title: 'Submission Returned',
        message: `Your submission for "${assignment.title}" has been returned for revision.`,
        type: 'comment_added',
        class_id: assignment.class_id,
        assignment_id: assignment.id
      })
      .execute();

    return updatedSubmission;
  } catch (error) {
    console.error('Returning submission failed:', error);
    throw error;
  }
}
