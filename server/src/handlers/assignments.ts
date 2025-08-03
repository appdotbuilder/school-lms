
import { db } from '../db';
import { assignmentsTable, classesTable, classEnrollmentsTable, calendarEventsTable } from '../db/schema';
import { type CreateAssignmentInput, type Assignment } from '../schema';
import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

export async function createAssignment(input: CreateAssignmentInput, teacherId: number): Promise<Assignment> {
  try {
    // Verify teacher owns the class
    const classCheck = await db.select()
      .from(classesTable)
      .where(and(
        eq(classesTable.id, input.class_id),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (classCheck.length === 0) {
      throw new Error('Class not found or access denied');
    }

    // Create assignment
    const result = await db.insert(assignmentsTable)
      .values({
        title: input.title,
        description: input.description || null,
        type: input.type,
        class_id: input.class_id,
        teacher_id: teacherId,
        due_date: input.due_date || null,
        publish_date: input.publish_date || new Date(),
        max_points: input.max_points || null,
        allow_late_submission: input.allow_late_submission || false,
        is_published: input.is_published || true,
        rubric_data: input.rubric_data || null,
      })
      .returning()
      .execute();

    const assignment = result[0];

    // Create calendar event if there's a due date
    if (assignment.due_date) {
      await db.insert(calendarEventsTable)
        .values({
          title: `${assignment.title} Due`,
          description: `Assignment: ${assignment.title}`,
          class_id: assignment.class_id,
          assignment_id: assignment.id,
          event_date: assignment.due_date,
          event_type: 'assignment_due',
          created_by: teacherId,
        })
        .execute();
    }

    return assignment;
  } catch (error) {
    console.error('Assignment creation failed:', error);
    throw error;
  }
}

export async function getAssignmentsByClass(classId: number, userId: number): Promise<Assignment[]> {
  try {
    // Check if user has access to the class (either teacher or enrolled student)
    const accessCheck = await db.select()
      .from(classesTable)
      .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.class_id, classesTable.id))
      .where(and(
        eq(classesTable.id, classId),
        eq(classesTable.teacher_id, userId)
      ))
      .execute();

    const enrollmentCheck = await db.select()
      .from(classEnrollmentsTable)
      .where(and(
        eq(classEnrollmentsTable.class_id, classId),
        eq(classEnrollmentsTable.user_id, userId)
      ))
      .execute();

    if (accessCheck.length === 0 && enrollmentCheck.length === 0) {
      throw new Error('Access denied to class');
    }

    // Build query conditions
    const conditions: SQL<unknown>[] = [eq(assignmentsTable.class_id, classId)];

    // Students can only see published assignments
    const isTeacher = accessCheck.length > 0;
    if (!isTeacher) {
      conditions.push(eq(assignmentsTable.is_published, true));
    }

    const assignments = await db.select()
      .from(assignmentsTable)
      .where(and(...conditions))
      .orderBy(desc(assignmentsTable.created_at))
      .execute();

    return assignments;
  } catch (error) {
    console.error('Failed to fetch assignments by class:', error);
    throw error;
  }
}

export async function getAssignmentById(assignmentId: number, userId: number): Promise<Assignment> {
  try {
    // Get assignment with class info to check access
    const result = await db.select()
      .from(assignmentsTable)
      .innerJoin(classesTable, eq(assignmentsTable.class_id, classesTable.id))
      .where(eq(assignmentsTable.id, assignmentId))
      .execute();

    if (result.length === 0) {
      throw new Error('Assignment not found');
    }

    const assignmentData = result[0].assignments;
    const classData = result[0].classes;

    // Check if user is teacher of the class
    const isTeacher = classData.teacher_id === userId;

    // Check if user is enrolled in the class
    let isEnrolled = false;
    if (!isTeacher) {
      const enrollmentCheck = await db.select()
        .from(classEnrollmentsTable)
        .where(and(
          eq(classEnrollmentsTable.class_id, classData.id),
          eq(classEnrollmentsTable.user_id, userId)
        ))
        .execute();
      
      isEnrolled = enrollmentCheck.length > 0;
    }

    if (!isTeacher && !isEnrolled) {
      throw new Error('Access denied to assignment');
    }

    // Students can only see published assignments
    if (!isTeacher && !assignmentData.is_published) {
      throw new Error('Assignment not available');
    }

    return assignmentData;
  } catch (error) {
    console.error('Failed to fetch assignment by ID:', error);
    throw error;
  }
}

export async function getUpcomingAssignments(userId: number): Promise<Assignment[]> {
  try {
    // Get all classes the user is enrolled in
    const enrolledClasses = await db.select()
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.user_id, userId))
      .execute();

    if (enrolledClasses.length === 0) {
      return [];
    }

    const classIds = enrolledClasses.map(enrollment => enrollment.class_id);
    const now = new Date();

    // Build conditions - use inArray for multiple class IDs
    const conditions: SQL<unknown>[] = [
      eq(assignmentsTable.is_published, true),
      gte(assignmentsTable.due_date, now),
      inArray(assignmentsTable.class_id, classIds)
    ];

    const assignments = await db.select()
      .from(assignmentsTable)
      .where(and(...conditions))
      .orderBy(assignmentsTable.due_date)
      .execute();

    return assignments;
  } catch (error) {
    console.error('Failed to fetch upcoming assignments:', error);
    throw error;
  }
}

export async function updateAssignment(assignmentId: number, input: Partial<CreateAssignmentInput>, teacherId: number): Promise<Assignment> {
  try {
    // Verify assignment exists and teacher owns it
    const existingAssignment = await db.select()
      .from(assignmentsTable)
      .innerJoin(classesTable, eq(assignmentsTable.class_id, classesTable.id))
      .where(and(
        eq(assignmentsTable.id, assignmentId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (existingAssignment.length === 0) {
      throw new Error('Assignment not found or access denied');
    }

    // If class_id is being changed, verify teacher owns the new class
    if (input.class_id && input.class_id !== existingAssignment[0].assignments.class_id) {
      const newClassCheck = await db.select()
        .from(classesTable)
        .where(and(
          eq(classesTable.id, input.class_id),
          eq(classesTable.teacher_id, teacherId)
        ))
        .execute();

      if (newClassCheck.length === 0) {
        throw new Error('New class not found or access denied');
      }
    }

    // Build update values
    const updateValues: any = {
      updated_at: new Date(),
    };

    if (input.title !== undefined) updateValues.title = input.title;
    if (input.description !== undefined) updateValues.description = input.description;
    if (input.type !== undefined) updateValues.type = input.type;
    if (input.class_id !== undefined) updateValues.class_id = input.class_id;
    if (input.due_date !== undefined) updateValues.due_date = input.due_date;
    if (input.publish_date !== undefined) updateValues.publish_date = input.publish_date;
    if (input.max_points !== undefined) updateValues.max_points = input.max_points;
    if (input.allow_late_submission !== undefined) updateValues.allow_late_submission = input.allow_late_submission;
    if (input.is_published !== undefined) updateValues.is_published = input.is_published;
    if (input.rubric_data !== undefined) updateValues.rubric_data = input.rubric_data;

    // Update assignment
    const result = await db.update(assignmentsTable)
      .set(updateValues)
      .where(eq(assignmentsTable.id, assignmentId))
      .returning()
      .execute();

    const updatedAssignment = result[0];

    // Update calendar event if due date changed
    if (input.due_date !== undefined) {
      // Delete existing calendar event
      await db.delete(calendarEventsTable)
        .where(eq(calendarEventsTable.assignment_id, assignmentId))
        .execute();

      // Create new calendar event if there's a due date
      if (updatedAssignment.due_date) {
        await db.insert(calendarEventsTable)
          .values({
            title: `${updatedAssignment.title} Due`,
            description: `Assignment: ${updatedAssignment.title}`,
            class_id: updatedAssignment.class_id,
            assignment_id: updatedAssignment.id,
            event_date: updatedAssignment.due_date,
            event_type: 'assignment_due',
            created_by: teacherId,
          })
          .execute();
      }
    }

    return updatedAssignment;
  } catch (error) {
    console.error('Assignment update failed:', error);
    throw error;
  }
}

export async function deleteAssignment(assignmentId: number, teacherId: number): Promise<void> {
  try {
    // Verify assignment exists and teacher owns it
    const assignmentCheck = await db.select()
      .from(assignmentsTable)
      .innerJoin(classesTable, eq(assignmentsTable.class_id, classesTable.id))
      .where(and(
        eq(assignmentsTable.id, assignmentId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (assignmentCheck.length === 0) {
      throw new Error('Assignment not found or access denied');
    }

    // Delete related calendar events first
    await db.delete(calendarEventsTable)
      .where(eq(calendarEventsTable.assignment_id, assignmentId))
      .execute();

    // Delete assignment (cascade will handle related records)
    await db.delete(assignmentsTable)
      .where(eq(assignmentsTable.id, assignmentId))
      .execute();
  } catch (error) {
    console.error('Assignment deletion failed:', error);
    throw error;
  }
}
