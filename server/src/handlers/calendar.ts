
import { db } from '../db';
import { calendarEventsTable, classEnrollmentsTable, classesTable, assignmentsTable } from '../db/schema';
import { type CalendarEvent } from '../schema';
import { eq, and, gte, lte, or, desc, asc, SQL } from 'drizzle-orm';

export async function getCalendarEvents(userId: number, startDate?: Date, endDate?: Date): Promise<CalendarEvent[]> {
  try {
    // Get all classes the user is enrolled in or teaching
    const userClasses = await db.select({ class_id: classEnrollmentsTable.class_id })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.user_id, userId))
      .execute();

    const teachingClasses = await db.select({ class_id: classesTable.id })
      .from(classesTable)
      .where(eq(classesTable.teacher_id, userId))
      .execute();

    const allClassIds = [
      ...userClasses.map(c => c.class_id),
      ...teachingClasses.map(c => c.class_id)
    ];

    if (allClassIds.length === 0) {
      return [];
    }

    // Build conditions array
    const conditions: SQL<unknown>[] = [];
    
    // Add class filter - ensure we have at least one class ID
    const classCondition = allClassIds.length === 1 
      ? eq(calendarEventsTable.class_id, allClassIds[0])
      : or(...allClassIds.map(classId => eq(calendarEventsTable.class_id, classId)));
    
    if (classCondition) {
      conditions.push(classCondition);
    }

    // Add date filters if provided
    if (startDate) {
      conditions.push(gte(calendarEventsTable.event_date, startDate));
    }
    if (endDate) {
      conditions.push(lte(calendarEventsTable.event_date, endDate));
    }

    // Build and execute query
    const results = await db.select()
      .from(calendarEventsTable)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(asc(calendarEventsTable.event_date))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get calendar events:', error);
    throw error;
  }
}

export async function createCalendarEvent(classId: number, title: string, description: string, eventDate: Date, eventType: string, createdBy: number, assignmentId?: number): Promise<CalendarEvent> {
  try {
    const result = await db.insert(calendarEventsTable)
      .values({
        title,
        description: description || null,
        class_id: classId,
        assignment_id: assignmentId || null,
        event_date: eventDate,
        event_type: eventType,
        created_by: createdBy
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    throw error;
  }
}

export async function updateCalendarEvent(eventId: number, title: string, description: string, eventDate: Date, teacherId: number): Promise<CalendarEvent> {
  try {
    const result = await db.update(calendarEventsTable)
      .set({
        title,
        description: description || null,
        event_date: eventDate
      })
      .where(eq(calendarEventsTable.id, eventId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Calendar event not found');
    }

    return result[0];
  } catch (error) {
    console.error('Failed to update calendar event:', error);
    throw error;
  }
}

export async function deleteCalendarEvent(eventId: number, userId: number): Promise<void> {
  try {
    const result = await db.delete(calendarEventsTable)
      .where(eq(calendarEventsTable.id, eventId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Calendar event not found');
    }
  } catch (error) {
    console.error('Failed to delete calendar event:', error);
    throw error;
  }
}

export async function getUpcomingDeadlines(userId: number): Promise<CalendarEvent[]> {
  try {
    // Get upcoming assignment deadlines (next 7 days)
    const now = new Date();
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Get all classes the user is enrolled in or teaching
    const userClasses = await db.select({ class_id: classEnrollmentsTable.class_id })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.user_id, userId))
      .execute();

    const teachingClasses = await db.select({ class_id: classesTable.id })
      .from(classesTable)
      .where(eq(classesTable.teacher_id, userId))
      .execute();

    const allClassIds = [
      ...userClasses.map(c => c.class_id),
      ...teachingClasses.map(c => c.class_id)
    ];

    if (allClassIds.length === 0) {
      return [];
    }

    const conditions: SQL<unknown>[] = [];
    
    // Add class filter - ensure we have at least one class ID
    const classCondition = allClassIds.length === 1 
      ? eq(calendarEventsTable.class_id, allClassIds[0])
      : or(...allClassIds.map(classId => eq(calendarEventsTable.class_id, classId)));
    
    if (classCondition) {
      conditions.push(classCondition);
    }
    
    conditions.push(gte(calendarEventsTable.event_date, now));
    conditions.push(lte(calendarEventsTable.event_date, nextWeek));

    const results = await db.select()
      .from(calendarEventsTable)
      .where(and(...conditions))
      .orderBy(asc(calendarEventsTable.event_date))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get upcoming deadlines:', error);
    throw error;
  }
}

export async function getCalendarEventsByClass(classId: number, userId: number): Promise<CalendarEvent[]> {
  try {
    // Verify user has access to this class
    const enrollment = await db.select()
      .from(classEnrollmentsTable)
      .where(and(
        eq(classEnrollmentsTable.user_id, userId),
        eq(classEnrollmentsTable.class_id, classId)
      ))
      .execute();

    const teachingClass = await db.select()
      .from(classesTable)
      .where(and(
        eq(classesTable.id, classId),
        eq(classesTable.teacher_id, userId)
      ))
      .execute();

    if (enrollment.length === 0 && teachingClass.length === 0) {
      throw new Error('Access denied to class');
    }

    const results = await db.select()
      .from(calendarEventsTable)
      .where(eq(calendarEventsTable.class_id, classId))
      .orderBy(asc(calendarEventsTable.event_date))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get calendar events by class:', error);
    throw error;
  }
}
