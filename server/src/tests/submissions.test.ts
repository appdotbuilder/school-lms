
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, classesTable, assignmentsTable, classEnrollmentsTable, submissionsTable, gradebookTable, notificationsTable } from '../db/schema';
import { type CreateSubmissionInput, type GradeSubmissionInput } from '../schema';
import { 
  createSubmission, 
  getSubmissionsByAssignment, 
  getSubmissionByStudent, 
  gradeSubmission, 
  getPendingSubmissions, 
  returnSubmissionForRevision 
} from '../handlers/submissions';
import { eq, and } from 'drizzle-orm';

// Test data
let teacherId: number;
let studentId: number;
let classId: number;
let assignmentId: number;

const testCreateSubmissionInput: CreateSubmissionInput = {
  assignment_id: 0, // Will be set in beforeEach
  content: 'This is my submission content'
};

const testGradeSubmissionInput: GradeSubmissionInput = {
  submission_id: 0, // Will be set in tests
  points_earned: 85,
  grade_feedback: 'Good work, but could use more detail in section 2.'
};

describe('submissions handlers', () => {
  beforeEach(async () => {
    await createDB();

    // Create test teacher
    const teachers = await db.insert(usersTable)
      .values({
        email: 'teacher@test.com',
        password_hash: 'hashedpassword',
        first_name: 'John',
        last_name: 'Teacher',
        role: 'teacher'
      })
      .returning()
      .execute();

    teacherId = teachers[0].id;

    // Create test student
    const students = await db.insert(usersTable)
      .values({
        email: 'student@test.com',
        password_hash: 'hashedpassword',
        first_name: 'Jane',
        last_name: 'Student',
        role: 'student'
      })
      .returning()
      .execute();

    studentId = students[0].id;

    // Create test class
    const classes = await db.insert(classesTable)
      .values({
        name: 'Test Class',
        description: 'A test class',
        class_code: 'TEST123',
        teacher_id: teacherId
      })
      .returning()
      .execute();

    classId = classes[0].id;

    // Enroll student in class
    await db.insert(classEnrollmentsTable)
      .values({
        user_id: studentId,
        class_id: classId
      })
      .execute();

    // Create test assignment
    const assignments = await db.insert(assignmentsTable)
      .values({
        title: 'Test Assignment',
        description: 'A test assignment',
        type: 'assignment',
        class_id: classId,
        teacher_id: teacherId,
        max_points: 100
      })
      .returning()
      .execute();

    assignmentId = assignments[0].id;
    testCreateSubmissionInput.assignment_id = assignmentId;
  });

  afterEach(resetDB);

  describe('createSubmission', () => {
    it('should create a new submission', async () => {
      const result = await createSubmission(testCreateSubmissionInput, studentId);

      expect(result.assignment_id).toEqual(assignmentId);
      expect(result.student_id).toEqual(studentId);
      expect(result.content).toEqual('This is my submission content');
      expect(result.status).toEqual('submitted');
      expect(result.submitted_at).toBeInstanceOf(Date);
      expect(result.graded_at).toBeNull();
      expect(result.points_earned).toBeNull();
    });

    it('should save submission to database', async () => {
      const result = await createSubmission(testCreateSubmissionInput, studentId);

      const submissions = await db.select()
        .from(submissionsTable)
        .where(eq(submissionsTable.id, result.id))
        .execute();

      expect(submissions).toHaveLength(1);
      expect(submissions[0].content).toEqual('This is my submission content');
      expect(submissions[0].status).toEqual('submitted');
    });

    it('should update existing submission instead of creating duplicate', async () => {
      // Create first submission
      const firstSubmission = await createSubmission(testCreateSubmissionInput, studentId);

      // Update with new content
      const updatedInput = {
        ...testCreateSubmissionInput,
        content: 'Updated submission content'
      };

      const secondSubmission = await createSubmission(updatedInput, studentId);

      // Should be same submission ID
      expect(secondSubmission.id).toEqual(firstSubmission.id);
      expect(secondSubmission.content).toEqual('Updated submission content');

      // Verify only one submission exists in database
      const allSubmissions = await db.select()
        .from(submissionsTable)
        .where(
          and(
            eq(submissionsTable.assignment_id, assignmentId),
            eq(submissionsTable.student_id, studentId)
          )
        )
        .execute();

      expect(allSubmissions).toHaveLength(1);
    });

    it('should reject submission for non-existent assignment', async () => {
      const invalidInput = {
        ...testCreateSubmissionInput,
        assignment_id: 9999
      };

      await expect(createSubmission(invalidInput, studentId))
        .rejects.toThrow(/assignment not found/i);
    });

    it('should reject submission from non-enrolled student', async () => {
      // Create another student not enrolled in class
      const otherStudents = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'Student',
          role: 'student'
        })
        .returning()
        .execute();

      const otherStudentId = otherStudents[0].id;

      await expect(createSubmission(testCreateSubmissionInput, otherStudentId))
        .rejects.toThrow(/student not enrolled/i);
    });
  });

  describe('getSubmissionsByAssignment', () => {
    it('should return all submissions for an assignment', async () => {
      // Create a submission
      await createSubmission(testCreateSubmissionInput, studentId);

      // Create another student and enroll them
      const otherStudents = await db.insert(usersTable)
        .values({
          email: 'student2@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Bob',
          last_name: 'Student',
          role: 'student'
        })
        .returning()
        .execute();

      const otherStudentId = otherStudents[0].id;

      await db.insert(classEnrollmentsTable)
        .values({
          user_id: otherStudentId,
          class_id: classId
        })
        .execute();

      // Create submission from other student
      await createSubmission({
        assignment_id: assignmentId,
        content: 'Other student submission'
      }, otherStudentId);

      const submissions = await getSubmissionsByAssignment(assignmentId, teacherId);

      expect(submissions).toHaveLength(2);
      expect(submissions.some(s => s.student_id === studentId)).toBe(true);
      expect(submissions.some(s => s.student_id === otherStudentId)).toBe(true);
    });

    it('should reject access from non-owner teacher', async () => {
      // Create another teacher
      const otherTeachers = await db.insert(usersTable)
        .values({
          email: 'other.teacher@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'Teacher',
          role: 'teacher'
        })
        .returning()
        .execute();

      const otherTeacherId = otherTeachers[0].id;

      await expect(getSubmissionsByAssignment(assignmentId, otherTeacherId))
        .rejects.toThrow(/not owned by teacher/i);
    });

    it('should return empty array for assignment with no submissions', async () => {
      const submissions = await getSubmissionsByAssignment(assignmentId, teacherId);
      expect(submissions).toHaveLength(0);
    });
  });

  describe('getSubmissionByStudent', () => {
    it('should return student submission', async () => {
      const createdSubmission = await createSubmission(testCreateSubmissionInput, studentId);
      
      const submission = await getSubmissionByStudent(assignmentId, studentId);

      expect(submission).not.toBeNull();
      expect(submission!.id).toEqual(createdSubmission.id);
      expect(submission!.content).toEqual('This is my submission content');
    });

    it('should return null when no submission exists', async () => {
      const submission = await getSubmissionByStudent(assignmentId, studentId);
      expect(submission).toBeNull();
    });

    it('should return null for different student', async () => {
      await createSubmission(testCreateSubmissionInput, studentId);

      // Create another student
      const otherStudents = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'Student',
          role: 'student'
        })
        .returning()
        .execute();

      const otherStudentId = otherStudents[0].id;

      const submission = await getSubmissionByStudent(assignmentId, otherStudentId);
      expect(submission).toBeNull();
    });
  });

  describe('gradeSubmission', () => {
    it('should grade a submission successfully', async () => {
      const createdSubmission = await createSubmission(testCreateSubmissionInput, studentId);
      
      const gradeInput = {
        ...testGradeSubmissionInput,
        submission_id: createdSubmission.id
      };

      const gradedSubmission = await gradeSubmission(gradeInput, teacherId);

      expect(gradedSubmission.status).toEqual('graded');
      expect(gradedSubmission.points_earned).toEqual(85);
      expect(gradedSubmission.grade_feedback).toEqual('Good work, but could use more detail in section 2.');
      expect(gradedSubmission.graded_at).toBeInstanceOf(Date);
      expect(gradedSubmission.graded_by).toEqual(teacherId);
    });

    it('should create gradebook entry when grading', async () => {
      const createdSubmission = await createSubmission(testCreateSubmissionInput, studentId);
      
      const gradeInput = {
        ...testGradeSubmissionInput,
        submission_id: createdSubmission.id
      };

      await gradeSubmission(gradeInput, teacherId);

      const gradebookEntries = await db.select()
        .from(gradebookTable)
        .where(
          and(
            eq(gradebookTable.student_id, studentId),
            eq(gradebookTable.assignment_id, assignmentId)
          )
        )
        .execute();

      expect(gradebookEntries).toHaveLength(1);
      expect(gradebookEntries[0].points_earned).toEqual(85);
      expect(gradebookEntries[0].points_possible).toEqual(100);
      expect(gradebookEntries[0].percentage).toEqual(85);
    });

    it('should create notification for student', async () => {
      const createdSubmission = await createSubmission(testCreateSubmissionInput, studentId);
      
      const gradeInput = {
        ...testGradeSubmissionInput,
        submission_id: createdSubmission.id
      };

      await gradeSubmission(gradeInput, teacherId);

      const notifications = await db.select()
        .from(notificationsTable)
        .where(eq(notificationsTable.user_id, studentId))
        .execute();

      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toEqual('grade_received');
      expect(notifications[0].title).toEqual('Assignment Graded');
    });

    it('should reject grading by unauthorized teacher', async () => {
      const createdSubmission = await createSubmission(testCreateSubmissionInput, studentId);

      // Create another teacher
      const otherTeachers = await db.insert(usersTable)
        .values({
          email: 'other.teacher@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'Teacher',
          role: 'teacher'
        })
        .returning()
        .execute();

      const otherTeacherId = otherTeachers[0].id;
      
      const gradeInput = {
        ...testGradeSubmissionInput,
        submission_id: createdSubmission.id
      };

      await expect(gradeSubmission(gradeInput, otherTeacherId))
        .rejects.toThrow(/not authorized to grade/i);
    });
  });

  describe('getPendingSubmissions', () => {
    it('should return pending submissions for teacher', async () => {
      await createSubmission(testCreateSubmissionInput, studentId);

      const pendingSubmissions = await getPendingSubmissions(teacherId);

      expect(pendingSubmissions).toHaveLength(1);
      expect(pendingSubmissions[0].status).toEqual('submitted');
      expect(pendingSubmissions[0].student_id).toEqual(studentId);
    });

    it('should not return graded submissions', async () => {
      const createdSubmission = await createSubmission(testCreateSubmissionInput, studentId);
      
      // Grade the submission
      const gradeInput = {
        ...testGradeSubmissionInput,
        submission_id: createdSubmission.id
      };
      await gradeSubmission(gradeInput, teacherId);

      const pendingSubmissions = await getPendingSubmissions(teacherId);
      expect(pendingSubmissions).toHaveLength(0);
    });

    it('should return empty array when no pending submissions', async () => {
      const pendingSubmissions = await getPendingSubmissions(teacherId);
      expect(pendingSubmissions).toHaveLength(0);
    });
  });

  describe('returnSubmissionForRevision', () => {
    it('should return submission for revision', async () => {
      const createdSubmission = await createSubmission(testCreateSubmissionInput, studentId);

      const feedback = 'Please revise section 2 with more details.';
      const returnedSubmission = await returnSubmissionForRevision(
        createdSubmission.id, 
        feedback, 
        teacherId
      );

      expect(returnedSubmission.status).toEqual('returned');
      expect(returnedSubmission.grade_feedback).toEqual(feedback);
      expect(returnedSubmission.graded_by).toEqual(teacherId);
    });

    it('should create notification for student about returned submission', async () => {
      const createdSubmission = await createSubmission(testCreateSubmissionInput, studentId);

      const feedback = 'Please revise section 2 with more details.';
      await returnSubmissionForRevision(createdSubmission.id, feedback, teacherId);

      const notifications = await db.select()
        .from(notificationsTable)
        .where(eq(notificationsTable.user_id, studentId))
        .execute();

      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toEqual('comment_added');
      expect(notifications[0].title).toEqual('Submission Returned');
    });

    it('should reject unauthorized teacher', async () => {
      const createdSubmission = await createSubmission(testCreateSubmissionInput, studentId);

      // Create another teacher
      const otherTeachers = await db.insert(usersTable)
        .values({
          email: 'other.teacher@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'Teacher',
          role: 'teacher'
        })
        .returning()
        .execute();

      const otherTeacherId = otherTeachers[0].id;

      await expect(returnSubmissionForRevision(
        createdSubmission.id, 
        'Some feedback', 
        otherTeacherId
      )).rejects.toThrow(/not authorized to return/i);
    });

    it('should reject non-existent submission', async () => {
      await expect(returnSubmissionForRevision(9999, 'Some feedback', teacherId))
        .rejects.toThrow(/submission not found/i);
    });
  });
});
