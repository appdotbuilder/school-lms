
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, classesTable, assignmentsTable, gradebookTable } from '../db/schema';
import {
  getGradebookByClass,
  getStudentGrades,
  updateGradebookEntry,
  excuseAssignment,
  getClassAverages,
  exportGradebook
} from '../handlers/gradebook';

describe('Gradebook Handlers', () => {
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
        password_hash: 'hashedpassword',
        first_name: 'John',
        last_name: 'Teacher',
        role: 'teacher',
      })
      .returning()
      .execute();
    teacherId = teacherResult[0].id;

    // Create test student
    const studentResult = await db.insert(usersTable)
      .values({
        email: 'student@test.com',
        password_hash: 'hashedpassword',
        first_name: 'Jane',
        last_name: 'Student',
        role: 'student',
      })
      .returning()
      .execute();
    studentId = studentResult[0].id;

    // Create test class
    const classResult = await db.insert(classesTable)
      .values({
        name: 'Test Class',
        class_code: 'TEST123',
        teacher_id: teacherId,
      })
      .returning()
      .execute();
    classId = classResult[0].id;

    // Create test assignment
    const assignmentResult = await db.insert(assignmentsTable)
      .values({
        title: 'Test Assignment',
        type: 'assignment',
        class_id: classId,
        teacher_id: teacherId,
        max_points: 100,
      })
      .returning()
      .execute();
    assignmentId = assignmentResult[0].id;
  });

  describe('getGradebookByClass', () => {
    it('should return gradebook entries for a class', async () => {
      // Create a gradebook entry
      await db.insert(gradebookTable)
        .values({
          student_id: studentId,
          class_id: classId,
          assignment_id: assignmentId,
          points_earned: 85,
          points_possible: 100,
          percentage: 85,
          letter_grade: 'B',
          is_excused: false,
        })
        .execute();

      const result = await getGradebookByClass(classId, teacherId);

      expect(result).toHaveLength(1);
      expect(result[0].student_id).toBe(studentId);
      expect(result[0].assignment_id).toBe(assignmentId);
      expect(result[0].points_earned).toBe(85);
      expect(result[0].percentage).toBe(85);
      expect(result[0].letter_grade).toBe('B');
    });

    it('should throw error for unauthorized teacher', async () => {
      const otherTeacherResult = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'Teacher',
          role: 'teacher',
        })
        .returning()
        .execute();

      await expect(getGradebookByClass(classId, otherTeacherResult[0].id))
        .rejects.toThrow(/access denied/i);
    });
  });

  describe('getStudentGrades', () => {
    it('should return grades for a student', async () => {
      // Create gradebook entries
      await db.insert(gradebookTable)
        .values({
          student_id: studentId,
          class_id: classId,
          assignment_id: assignmentId,
          points_earned: 90,
          points_possible: 100,
          percentage: 90,
          letter_grade: 'A',
          is_excused: false,
        })
        .execute();

      const result = await getStudentGrades(studentId);

      expect(result).toHaveLength(1);
      expect(result[0].student_id).toBe(studentId);
      expect(result[0].points_earned).toBe(90);
      expect(result[0].percentage).toBe(90);
    });

    it('should filter by class when classId provided', async () => {
      // Create another class and assignment
      const otherClassResult = await db.insert(classesTable)
        .values({
          name: 'Other Class',
          class_code: 'OTHER123',
          teacher_id: teacherId,
        })
        .returning()
        .execute();

      const otherAssignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Other Assignment',
          type: 'assignment',
          class_id: otherClassResult[0].id,
          teacher_id: teacherId,
          max_points: 100,
        })
        .returning()
        .execute();

      // Create entries in both classes
      await db.insert(gradebookTable)
        .values([
          {
            student_id: studentId,
            class_id: classId,
            assignment_id: assignmentId,
            points_earned: 85,
            points_possible: 100,
            percentage: 85,
            letter_grade: 'B',
            is_excused: false,
          },
          {
            student_id: studentId,
            class_id: otherClassResult[0].id,
            assignment_id: otherAssignmentResult[0].id,
            points_earned: 95,
            points_possible: 100,
            percentage: 95,
            letter_grade: 'A',
            is_excused: false,
          }
        ])
        .execute();

      const result = await getStudentGrades(studentId, classId);

      expect(result).toHaveLength(1);
      expect(result[0].class_id).toBe(classId);
      expect(result[0].points_earned).toBe(85);
    });
  });

  describe('updateGradebookEntry', () => {
    it('should create new gradebook entry', async () => {
      const result = await updateGradebookEntry(studentId, assignmentId, 88, teacherId);

      expect(result.student_id).toBe(studentId);
      expect(result.assignment_id).toBe(assignmentId);
      expect(result.points_earned).toBe(88);
      expect(result.points_possible).toBe(100);
      expect(result.percentage).toBe(88);
      expect(result.letter_grade).toBe('B');
      expect(result.is_excused).toBe(false);
    });

    it('should update existing gradebook entry', async () => {
      // Create initial entry
      await db.insert(gradebookTable)
        .values({
          student_id: studentId,
          class_id: classId,
          assignment_id: assignmentId,
          points_earned: 75,
          points_possible: 100,
          percentage: 75,
          letter_grade: 'C',
          is_excused: false,
        })
        .execute();

      const result = await updateGradebookEntry(studentId, assignmentId, 92, teacherId);

      expect(result.points_earned).toBe(92);
      expect(result.percentage).toBe(92);
      expect(result.letter_grade).toBe('A');
      expect(result.is_excused).toBe(false);
    });

    it('should calculate correct letter grades', async () => {
      const tests = [
        { points: 95, expected: 'A' },
        { points: 85, expected: 'B' },
        { points: 75, expected: 'C' },
        { points: 65, expected: 'D' },
        { points: 55, expected: 'F' },
      ];

      for (const test of tests) {
        const result = await updateGradebookEntry(studentId, assignmentId, test.points, teacherId);
        expect(result.letter_grade).toBe(test.expected);
      }
    });

    it('should throw error for unauthorized teacher', async () => {
      const otherTeacherResult = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'Teacher',
          role: 'teacher',
        })
        .returning()
        .execute();

      await expect(updateGradebookEntry(studentId, assignmentId, 85, otherTeacherResult[0].id))
        .rejects.toThrow(/access denied/i);
    });
  });

  describe('excuseAssignment', () => {
    it('should excuse assignment for student', async () => {
      const result = await excuseAssignment(studentId, assignmentId, teacherId);

      expect(result.student_id).toBe(studentId);
      expect(result.assignment_id).toBe(assignmentId);
      expect(result.points_earned).toBeNull();
      expect(result.percentage).toBeNull();
      expect(result.letter_grade).toBeNull();
      expect(result.is_excused).toBe(true);
    });

    it('should update existing entry to excused', async () => {
      // Create initial graded entry
      await db.insert(gradebookTable)
        .values({
          student_id: studentId,
          class_id: classId,
          assignment_id: assignmentId,
          points_earned: 85,
          points_possible: 100,
          percentage: 85,
          letter_grade: 'B',
          is_excused: false,
        })
        .execute();

      const result = await excuseAssignment(studentId, assignmentId, teacherId);

      expect(result.points_earned).toBeNull();
      expect(result.percentage).toBeNull();
      expect(result.letter_grade).toBeNull();
      expect(result.is_excused).toBe(true);
    });
  });

  describe('getClassAverages', () => {
    it('should calculate class averages by assignment', async () => {
      // Create another student
      const student2Result = await db.insert(usersTable)
        .values({
          email: 'student2@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Bob',
          last_name: 'Student',
          role: 'student',
        })
        .returning()
        .execute();

      // Create gradebook entries
      await db.insert(gradebookTable)
        .values([
          {
            student_id: studentId,
            class_id: classId,
            assignment_id: assignmentId,
            points_earned: 80,
            points_possible: 100,
            percentage: 80,
            letter_grade: 'B',
            is_excused: false,
          },
          {
            student_id: student2Result[0].id,
            class_id: classId,
            assignment_id: assignmentId,
            points_earned: 90,
            points_possible: 100,
            percentage: 90,
            letter_grade: 'A',
            is_excused: false,
          }
        ])
        .execute();

      const result = await getClassAverages(classId, teacherId);

      expect(result).toHaveLength(1);
      expect(result[0].assignmentId).toBe(assignmentId);
      expect(result[0].average).toBe(85); // (80 + 90) / 2
    });

    it('should exclude excused assignments from averages', async () => {
      // Create entries, one excused
      await db.insert(gradebookTable)
        .values([
          {
            student_id: studentId,
            class_id: classId,
            assignment_id: assignmentId,
            points_earned: 80,
            points_possible: 100,
            percentage: 80,
            letter_grade: 'B',
            is_excused: false,
          },
          {
            student_id: studentId,
            class_id: classId,
            assignment_id: assignmentId,
            points_earned: null,
            points_possible: 100,
            percentage: null,
            letter_grade: null,
            is_excused: true,
          }
        ])
        .execute();

      const result = await getClassAverages(classId, teacherId);

      expect(result).toHaveLength(1);
      expect(result[0].average).toBe(80); // Only non-excused entry counted
    });
  });

  describe('exportGradebook', () => {
    it('should export detailed gradebook data', async () => {
      // Create gradebook entry
      await db.insert(gradebookTable)
        .values({
          student_id: studentId,
          class_id: classId,
          assignment_id: assignmentId,
          points_earned: 85,
          points_possible: 100,
          percentage: 85,
          letter_grade: 'B',
          is_excused: false,
        })
        .execute();

      const result = await exportGradebook(classId, teacherId);

      expect(result).toHaveLength(1);
      expect(result[0].student_id).toBe(studentId);
      expect(result[0].student_first_name).toBe('Jane');
      expect(result[0].student_last_name).toBe('Student');
      expect(result[0].assignment_id).toBe(assignmentId);
      expect(result[0].assignment_title).toBe('Test Assignment');
      expect(result[0].points_earned).toBe(85);
      expect(result[0].percentage).toBe(85);
      expect(result[0].letter_grade).toBe('B');
      expect(result[0].is_excused).toBe(false);
    });

    it('should throw error for unauthorized teacher', async () => {
      const otherTeacherResult = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'Teacher',
          role: 'teacher',
        })
        .returning()
        .execute();

      await expect(exportGradebook(classId, otherTeacherResult[0].id))
        .rejects.toThrow(/access denied/i);
    });
  });
});
