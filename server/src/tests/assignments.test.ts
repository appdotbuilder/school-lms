
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, classesTable, classEnrollmentsTable, assignmentsTable, calendarEventsTable } from '../db/schema';
import { type CreateAssignmentInput } from '../schema';
import { 
  createAssignment, 
  getAssignmentsByClass, 
  getAssignmentById, 
  getUpcomingAssignments, 
  updateAssignment, 
  deleteAssignment 
} from '../handlers/assignments';
import { eq, and } from 'drizzle-orm';

describe('Assignment Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper to create test users
  const createTestUsers = async () => {
    const users = await db.insert(usersTable)
      .values([
        {
          email: 'teacher@test.com',
          password_hash: 'hashed_password',
          first_name: 'Teacher',
          last_name: 'User',
          role: 'teacher',
        },
        {
          email: 'student@test.com',
          password_hash: 'hashed_password',
          first_name: 'Student',
          last_name: 'User',
          role: 'student',
        },
        {
          email: 'other@test.com',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'student',
        }
      ])
      .returning()
      .execute();

    return {
      teacher: users[0],
      student: users[1],
      otherUser: users[2]
    };
  };

  // Helper to create test class
  const createTestClass = async (teacherId: number) => {
    const result = await db.insert(classesTable)
      .values({
        name: 'Test Class',
        description: 'A test class',
        class_code: 'TEST123',
        teacher_id: teacherId,
      })
      .returning()
      .execute();

    return result[0];
  };

  // Helper to enroll student in class
  const enrollStudent = async (userId: number, classId: number) => {
    await db.insert(classEnrollmentsTable)
      .values({
        user_id: userId,
        class_id: classId,
      })
      .execute();
  };

  describe('createAssignment', () => {
    it('should create an assignment successfully', async () => {
      const { teacher } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const input: CreateAssignmentInput = {
        title: 'Test Assignment',
        description: 'A test assignment',
        type: 'assignment',
        class_id: testClass.id,
        due_date: new Date('2024-12-31'),
        max_points: 100,
        allow_late_submission: true,
        is_published: true,
      };

      const result = await createAssignment(input, teacher.id);

      expect(result.id).toBeDefined();
      expect(result.title).toEqual('Test Assignment');
      expect(result.description).toEqual('A test assignment');
      expect(result.type).toEqual('assignment');
      expect(result.class_id).toEqual(testClass.id);
      expect(result.teacher_id).toEqual(teacher.id);
      expect(result.due_date).toBeInstanceOf(Date);
      expect(result.max_points).toEqual(100);
      expect(result.allow_late_submission).toEqual(true);
      expect(result.is_published).toEqual(true);
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create calendar event when due date is provided', async () => {
      const { teacher } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const input: CreateAssignmentInput = {
        title: 'Assignment with Due Date',
        type: 'assignment',
        class_id: testClass.id,
        due_date: new Date('2024-12-31'),
      };

      const assignment = await createAssignment(input, teacher.id);

      const calendarEvents = await db.select()
        .from(calendarEventsTable)
        .where(eq(calendarEventsTable.assignment_id, assignment.id))
        .execute();

      expect(calendarEvents).toHaveLength(1);
      expect(calendarEvents[0].title).toEqual('Assignment with Due Date Due');
      expect(calendarEvents[0].event_type).toEqual('assignment_due');
    });

    it('should throw error when teacher does not own class', async () => {
      const { teacher, otherUser } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const input: CreateAssignmentInput = {
        title: 'Unauthorized Assignment',
        type: 'assignment',
        class_id: testClass.id,
      };

      await expect(createAssignment(input, otherUser.id)).rejects.toThrow(/access denied/i);
    });

    it('should throw error when class does not exist', async () => {
      const { teacher } = await createTestUsers();

      const input: CreateAssignmentInput = {
        title: 'Assignment for Nonexistent Class',
        type: 'assignment',
        class_id: 999,
      };

      await expect(createAssignment(input, teacher.id)).rejects.toThrow(/not found/i);
    });
  });

  describe('getAssignmentsByClass', () => {
    it('should return assignments for teacher', async () => {
      const { teacher } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      // Create test assignments
      await db.insert(assignmentsTable)
        .values([
          {
            title: 'Published Assignment',
            type: 'assignment',
            class_id: testClass.id,
            teacher_id: teacher.id,
            is_published: true,
          },
          {
            title: 'Unpublished Assignment',
            type: 'assignment',
            class_id: testClass.id,
            teacher_id: teacher.id,
            is_published: false,
          }
        ])
        .execute();

      const assignments = await getAssignmentsByClass(testClass.id, teacher.id);

      expect(assignments).toHaveLength(2);
      expect(assignments.some(a => a.title === 'Published Assignment')).toBe(true);
      expect(assignments.some(a => a.title === 'Unpublished Assignment')).toBe(true);
    });

    it('should return only published assignments for enrolled student', async () => {
      const { teacher, student } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);
      await enrollStudent(student.id, testClass.id);

      // Create test assignments
      await db.insert(assignmentsTable)
        .values([
          {
            title: 'Published Assignment',
            type: 'assignment',
            class_id: testClass.id,
            teacher_id: teacher.id,
            is_published: true,
          },
          {
            title: 'Unpublished Assignment',
            type: 'assignment',
            class_id: testClass.id,
            teacher_id: teacher.id,
            is_published: false,
          }
        ])
        .execute();

      const assignments = await getAssignmentsByClass(testClass.id, student.id);

      expect(assignments).toHaveLength(1);
      expect(assignments[0].title).toEqual('Published Assignment');
      expect(assignments[0].is_published).toBe(true);
    });

    it('should throw error for non-enrolled user', async () => {
      const { teacher, otherUser } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      await expect(getAssignmentsByClass(testClass.id, otherUser.id)).rejects.toThrow(/access denied/i);
    });
  });

  describe('getAssignmentById', () => {
    it('should return assignment for teacher', async () => {
      const { teacher } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Test Assignment',
          type: 'assignment',
          class_id: testClass.id,
          teacher_id: teacher.id,
          is_published: false,
        })
        .returning()
        .execute();

      const assignment = await getAssignmentById(assignmentResult[0].id, teacher.id);

      expect(assignment.id).toEqual(assignmentResult[0].id);
      expect(assignment.title).toEqual('Test Assignment');
      expect(assignment.is_published).toBe(false);
    });

    it('should return published assignment for enrolled student', async () => {
      const { teacher, student } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);
      await enrollStudent(student.id, testClass.id);

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Published Assignment',
          type: 'assignment',
          class_id: testClass.id,
          teacher_id: teacher.id,
          is_published: true,
        })
        .returning()
        .execute();

      const assignment = await getAssignmentById(assignmentResult[0].id, student.id);

      expect(assignment.id).toEqual(assignmentResult[0].id);
      expect(assignment.title).toEqual('Published Assignment');
    });

    it('should throw error when student tries to access unpublished assignment', async () => {
      const { teacher, student } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);
      await enrollStudent(student.id, testClass.id);

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Unpublished Assignment',
          type: 'assignment',
          class_id: testClass.id,
          teacher_id: teacher.id,
          is_published: false,
        })
        .returning()
        .execute();

      await expect(getAssignmentById(assignmentResult[0].id, student.id)).rejects.toThrow(/not available/i);
    });

    it('should throw error for non-enrolled user', async () => {
      const { teacher, otherUser } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Assignment',
          type: 'assignment',
          class_id: testClass.id,
          teacher_id: teacher.id,
          is_published: true,
        })
        .returning()
        .execute();

      await expect(getAssignmentById(assignmentResult[0].id, otherUser.id)).rejects.toThrow(/access denied/i);
    });
  });

  describe('getUpcomingAssignments', () => {
    it('should return upcoming assignments for enrolled student', async () => {
      const { teacher, student } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);
      await enrollStudent(student.id, testClass.id);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);

      await db.insert(assignmentsTable)
        .values([
          {
            title: 'Upcoming Assignment',
            type: 'assignment',
            class_id: testClass.id,
            teacher_id: teacher.id,
            due_date: futureDate,
            is_published: true,
          },
          {
            title: 'Past Assignment',
            type: 'assignment',
            class_id: testClass.id,
            teacher_id: teacher.id,
            due_date: pastDate,
            is_published: true,
          }
        ])
        .execute();

      const assignments = await getUpcomingAssignments(student.id);

      expect(assignments).toHaveLength(1);
      expect(assignments[0].title).toEqual('Upcoming Assignment');
      expect(assignments[0].due_date).toBeInstanceOf(Date);
    });

    it('should return empty array for user with no enrollments', async () => {
      const { otherUser } = await createTestUsers();

      const assignments = await getUpcomingAssignments(otherUser.id);

      expect(assignments).toHaveLength(0);
    });
  });

  describe('updateAssignment', () => {
    it('should update assignment successfully', async () => {
      const { teacher } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Original Title',
          type: 'assignment',
          class_id: testClass.id,
          teacher_id: teacher.id,
        })
        .returning()
        .execute();

      const updates: Partial<CreateAssignmentInput> = {
        title: 'Updated Title',
        description: 'Updated description',
        max_points: 150,
      };

      const updatedAssignment = await updateAssignment(assignmentResult[0].id, updates, teacher.id);

      expect(updatedAssignment.title).toEqual('Updated Title');
      expect(updatedAssignment.description).toEqual('Updated description');
      expect(updatedAssignment.max_points).toEqual(150);
      expect(updatedAssignment.updated_at).toBeInstanceOf(Date);
    });

    it('should update calendar event when due date changes', async () => {
      const { teacher } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const originalDueDate = new Date('2024-12-31');
      const newDueDate = new Date('2025-01-15');

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Assignment with Due Date',
          type: 'assignment',
          class_id: testClass.id,
          teacher_id: teacher.id,
          due_date: originalDueDate,
        })
        .returning()
        .execute();

      // Create initial calendar event
      await db.insert(calendarEventsTable)
        .values({
          title: 'Assignment with Due Date Due',
          class_id: testClass.id,
          assignment_id: assignmentResult[0].id,
          event_date: originalDueDate,
          event_type: 'assignment_due',
          created_by: teacher.id,
        })
        .execute();

      await updateAssignment(assignmentResult[0].id, { due_date: newDueDate }, teacher.id);

      const calendarEvents = await db.select()
        .from(calendarEventsTable)
        .where(eq(calendarEventsTable.assignment_id, assignmentResult[0].id))
        .execute();

      expect(calendarEvents).toHaveLength(1);
      expect(calendarEvents[0].event_date).toEqual(newDueDate);
    });

    it('should throw error when non-owner tries to update', async () => {
      const { teacher, otherUser } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Assignment',
          type: 'assignment',
          class_id: testClass.id,
          teacher_id: teacher.id,
        })
        .returning()
        .execute();

      await expect(updateAssignment(assignmentResult[0].id, { title: 'Hacked' }, otherUser.id))
        .rejects.toThrow(/access denied/i);
    });
  });

  describe('deleteAssignment', () => {
    it('should delete assignment and related calendar events', async () => {
      const { teacher } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Assignment to Delete',
          type: 'assignment',
          class_id: testClass.id,
          teacher_id: teacher.id,
          due_date: new Date('2024-12-31'),
        })
        .returning()
        .execute();

      // Create calendar event
      await db.insert(calendarEventsTable)
        .values({
          title: 'Assignment to Delete Due',
          class_id: testClass.id,
          assignment_id: assignmentResult[0].id,
          event_date: new Date('2024-12-31'),
          event_type: 'assignment_due',
          created_by: teacher.id,
        })
        .execute();

      await deleteAssignment(assignmentResult[0].id, teacher.id);

      // Verify assignment is deleted
      const assignments = await db.select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, assignmentResult[0].id))
        .execute();

      expect(assignments).toHaveLength(0);

      // Verify calendar event is deleted
      const calendarEvents = await db.select()
        .from(calendarEventsTable)
        .where(eq(calendarEventsTable.assignment_id, assignmentResult[0].id))
        .execute();

      expect(calendarEvents).toHaveLength(0);
    });

    it('should throw error when non-owner tries to delete', async () => {
      const { teacher, otherUser } = await createTestUsers();
      const testClass = await createTestClass(teacher.id);

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Protected Assignment',
          type: 'assignment',
          class_id: testClass.id,
          teacher_id: teacher.id,
        })
        .returning()
        .execute();

      await expect(deleteAssignment(assignmentResult[0].id, otherUser.id))
        .rejects.toThrow(/access denied/i);
    });

    it('should throw error when assignment does not exist', async () => {
      const { teacher } = await createTestUsers();

      await expect(deleteAssignment(999, teacher.id))
        .rejects.toThrow(/not found/i);
    });
  });
});
