
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, classesTable, classEnrollmentsTable, calendarEventsTable, assignmentsTable } from '../db/schema';
import { getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getUpcomingDeadlines, getCalendarEventsByClass } from '../handlers/calendar';

// Test data
const testTeacher = {
  email: 'teacher@test.com',
  password_hash: 'hashed_password',
  first_name: 'Teacher',
  last_name: 'User',
  role: 'teacher' as const
};

const testStudent = {
  email: 'student@test.com',
  password_hash: 'hashed_password',
  first_name: 'Student',
  last_name: 'User',
  role: 'student' as const
};

const testClass = {
  name: 'Test Class',
  description: 'A test class',
  class_code: 'TEST123',
  image_url: null,
  teacher_id: 1
};

describe('Calendar Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  let teacherId: number;
  let studentId: number;
  let classId: number;

  beforeEach(async () => {
    // Create test users
    const teachers = await db.insert(usersTable)
      .values(testTeacher)
      .returning()
      .execute();
    teacherId = teachers[0].id;

    const students = await db.insert(usersTable)
      .values(testStudent)
      .returning()
      .execute();
    studentId = students[0].id;

    // Create test class
    const classes = await db.insert(classesTable)
      .values({ ...testClass, teacher_id: teacherId })
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
  });

  describe('createCalendarEvent', () => {
    it('should create a calendar event', async () => {
      const eventDate = new Date('2024-01-15T10:00:00Z');
      const result = await createCalendarEvent(
        classId,
        'Test Event',
        'Test Description',
        eventDate,
        'class_event',
        teacherId
      );

      expect(result.id).toBeDefined();
      expect(result.title).toEqual('Test Event');
      expect(result.description).toEqual('Test Description');
      expect(result.class_id).toEqual(classId);
      expect(result.assignment_id).toBeNull();
      expect(result.event_date).toEqual(eventDate);
      expect(result.event_type).toEqual('class_event');
      expect(result.created_by).toEqual(teacherId);
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create event with assignment reference', async () => {
      // First create a real assignment
      const assignment = await db.insert(assignmentsTable)
        .values({
          title: 'Math Homework',
          description: 'Chapter 5 problems',
          type: 'assignment',
          class_id: classId,
          teacher_id: teacherId,
          due_date: new Date('2024-01-20T09:00:00Z'),
          max_points: 100
        })
        .returning()
        .execute();

      const eventDate = new Date('2024-01-20T09:00:00Z');
      
      const result = await createCalendarEvent(
        classId,
        'Assignment Due',
        'Math homework due',
        eventDate,
        'assignment_due',
        teacherId,
        assignment[0].id
      );

      expect(result.assignment_id).toEqual(assignment[0].id);
      expect(result.event_type).toEqual('assignment_due');
    });

    it('should save event to database', async () => {
      const eventDate = new Date('2024-01-15T10:00:00Z');
      const result = await createCalendarEvent(
        classId,
        'Test Event',
        'Test Description',
        eventDate,
        'class_event',
        teacherId
      );

      const events = await db.select()
        .from(calendarEventsTable)
        .execute();

      expect(events).toHaveLength(1);
      expect(events[0].id).toEqual(result.id);
      expect(events[0].title).toEqual('Test Event');
    });
  });

  describe('getCalendarEvents', () => {
    it('should return events for enrolled classes', async () => {
      // Create test event
      const eventDate = new Date('2024-01-15T10:00:00Z');
      await createCalendarEvent(
        classId,
        'Test Event',
        'Test Description',
        eventDate,
        'class_event',
        teacherId
      );

      const results = await getCalendarEvents(studentId);

      expect(results).toHaveLength(1);
      expect(results[0].title).toEqual('Test Event');
      expect(results[0].class_id).toEqual(classId);
    });

    it('should return events for teaching classes', async () => {
      const eventDate = new Date('2024-01-15T10:00:00Z');
      await createCalendarEvent(
        classId,
        'Teacher Event',
        'Teacher Description',
        eventDate,
        'class_event',
        teacherId
      );

      const results = await getCalendarEvents(teacherId);

      expect(results).toHaveLength(1);
      expect(results[0].title).toEqual('Teacher Event');
    });

    it('should filter events by date range', async () => {
      // Create events on different dates
      await createCalendarEvent(
        classId,
        'Event 1',
        'Description 1',
        new Date('2024-01-10T10:00:00Z'),
        'class_event',
        teacherId
      );

      await createCalendarEvent(
        classId,
        'Event 2',
        'Description 2',
        new Date('2024-01-20T10:00:00Z'),
        'class_event',
        teacherId
      );

      await createCalendarEvent(
        classId,
        'Event 3',
        'Description 3',
        new Date('2024-01-30T10:00:00Z'),
        'class_event',
        teacherId
      );

      // Filter for events between Jan 15-25
      const startDate = new Date('2024-01-15T00:00:00Z');
      const endDate = new Date('2024-01-25T23:59:59Z');
      
      const results = await getCalendarEvents(studentId, startDate, endDate);

      expect(results).toHaveLength(1);
      expect(results[0].title).toEqual('Event 2');
    });

    it('should return empty array for user with no classes', async () => {
      // Create another user not enrolled in any classes
      const otherUser = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const results = await getCalendarEvents(otherUser[0].id);
      expect(results).toHaveLength(0);
    });
  });

  describe('updateCalendarEvent', () => {
    it('should update calendar event', async () => {
      const eventDate = new Date('2024-01-15T10:00:00Z');
      const event = await createCalendarEvent(
        classId,
        'Original Title',
        'Original Description',
        eventDate,
        'class_event',
        teacherId
      );

      const newDate = new Date('2024-01-20T14:00:00Z');
      const result = await updateCalendarEvent(
        event.id,
        'Updated Title',
        'Updated Description',
        newDate,
        teacherId
      );

      expect(result.id).toEqual(event.id);
      expect(result.title).toEqual('Updated Title');
      expect(result.description).toEqual('Updated Description');
      expect(result.event_date).toEqual(newDate);
    });

    it('should throw error for non-existent event', async () => {
      const newDate = new Date('2024-01-20T14:00:00Z');
      
      await expect(updateCalendarEvent(
        999,
        'Updated Title',
        'Updated Description',
        newDate,
        teacherId
      )).rejects.toThrow(/not found/i);
    });
  });

  describe('deleteCalendarEvent', () => {
    it('should delete calendar event', async () => {
      const eventDate = new Date('2024-01-15T10:00:00Z');
      const event = await createCalendarEvent(
        classId,
        'Test Event',
        'Test Description',
        eventDate,
        'class_event',
        teacherId
      );

      await deleteCalendarEvent(event.id, teacherId);

      const events = await db.select()
        .from(calendarEventsTable)
        .execute();

      expect(events).toHaveLength(0);
    });

    it('should throw error for non-existent event', async () => {
      await expect(deleteCalendarEvent(999, teacherId))
        .rejects.toThrow(/not found/i);
    });
  });

  describe('getUpcomingDeadlines', () => {
    it('should return events within next 7 days', async () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 6);
      
      const twoWeeks = new Date(now);
      twoWeeks.setDate(twoWeeks.getDate() + 14);

      // Create events at different times
      await createCalendarEvent(
        classId,
        'Tomorrow Event',
        'Due tomorrow',
        tomorrow,
        'assignment_due',
        teacherId
      );

      await createCalendarEvent(
        classId,
        'Next Week Event',
        'Due next week',
        nextWeek,
        'assignment_due',
        teacherId
      );

      await createCalendarEvent(
        classId,
        'Future Event',
        'Due in two weeks',
        twoWeeks,
        'assignment_due',
        teacherId
      );

      const results = await getUpcomingDeadlines(studentId);

      expect(results).toHaveLength(2);
      expect(results.map(r => r.title)).toContain('Tomorrow Event');
      expect(results.map(r => r.title)).toContain('Next Week Event');
      expect(results.map(r => r.title)).not.toContain('Future Event');
    });

    it('should return empty array for user with no classes', async () => {
      const otherUser = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const results = await getUpcomingDeadlines(otherUser[0].id);
      expect(results).toHaveLength(0);
    });
  });

  describe('getCalendarEventsByClass', () => {
    it('should return events for enrolled student', async () => {
      const eventDate = new Date('2024-01-15T10:00:00Z');
      await createCalendarEvent(
        classId,
        'Class Event',
        'Class Description',
        eventDate,
        'class_event',
        teacherId
      );

      const results = await getCalendarEventsByClass(classId, studentId);

      expect(results).toHaveLength(1);
      expect(results[0].title).toEqual('Class Event');
    });

    it('should return events for class teacher', async () => {
      const eventDate = new Date('2024-01-15T10:00:00Z');
      await createCalendarEvent(
        classId,
        'Class Event',
        'Class Description',
        eventDate,
        'class_event',
        teacherId
      );

      const results = await getCalendarEventsByClass(classId, teacherId);

      expect(results).toHaveLength(1);
      expect(results[0].title).toEqual('Class Event');
    });

    it('should throw error for unauthorized user', async () => {
      const otherUser = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      await expect(getCalendarEventsByClass(classId, otherUser[0].id))
        .rejects.toThrow(/access denied/i);
    });
  });
});
