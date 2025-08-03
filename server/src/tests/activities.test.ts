
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, classesTable, classEnrollmentsTable, activitiesTable } from '../db/schema';
import { type CreateActivityInput, type User, type Class } from '../schema';
import { 
  createActivity, 
  getActivitiesByClass, 
  updateActivity, 
  deleteActivity, 
  pinActivity, 
  getRecentActivities 
} from '../handlers/activities';
import { eq } from 'drizzle-orm';

// Test data
let testTeacher: User;
let testStudent: User;
let testClass: Class;

const testActivityInput: CreateActivityInput = {
  class_id: 1, // Will be updated after class creation
  title: 'Test Announcement',
  content: 'This is a test activity for the class',
  activity_type: 'announcement',
  is_pinned: false,
};

describe('Activities handlers', () => {
  beforeEach(async () => {
    await createDB();

    // Create test teacher
    const teacherResult = await db.insert(usersTable)
      .values({
        email: 'teacher@test.com',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'Teacher',
        role: 'teacher',
      })
      .returning()
      .execute();
    testTeacher = teacherResult[0];

    // Create test student
    const studentResult = await db.insert(usersTable)
      .values({
        email: 'student@test.com',
        password_hash: 'hashedpassword',
        first_name: 'Test',
        last_name: 'Student',
        role: 'student',
      })
      .returning()
      .execute();
    testStudent = studentResult[0];

    // Create test class
    const classResult = await db.insert(classesTable)
      .values({
        name: 'Test Class',
        description: 'A test class',
        class_code: 'TEST123',
        teacher_id: testTeacher.id,
      })
      .returning()
      .execute();
    testClass = classResult[0];

    // Enroll student in class
    await db.insert(classEnrollmentsTable)
      .values({
        user_id: testStudent.id,
        class_id: testClass.id,
      })
      .execute();

    // Update test input with actual class ID
    testActivityInput.class_id = testClass.id;
  });

  afterEach(resetDB);

  describe('createActivity', () => {
    it('should create an activity as teacher', async () => {
      const result = await createActivity(testActivityInput, testTeacher.id);

      expect(result.title).toEqual('Test Announcement');
      expect(result.content).toEqual(testActivityInput.content);
      expect(result.activity_type).toEqual('announcement');
      expect(result.class_id).toEqual(testClass.id);
      expect(result.author_id).toEqual(testTeacher.id);
      expect(result.is_pinned).toEqual(false);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create an activity as enrolled student', async () => {
      const result = await createActivity(testActivityInput, testStudent.id);

      expect(result.author_id).toEqual(testStudent.id);
      expect(result.class_id).toEqual(testClass.id);
      expect(result.content).toEqual(testActivityInput.content);
    });

    it('should save activity to database', async () => {
      const result = await createActivity(testActivityInput, testTeacher.id);

      const activities = await db.select()
        .from(activitiesTable)
        .where(eq(activitiesTable.id, result.id))
        .execute();

      expect(activities).toHaveLength(1);
      expect(activities[0].title).toEqual('Test Announcement');
      expect(activities[0].content).toEqual(testActivityInput.content);
    });

    it('should throw error for non-enrolled user', async () => {
      // Create another user not enrolled in the class
      const otherUser = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'User',
          role: 'student',
        })
        .returning()
        .execute();

      await expect(createActivity(testActivityInput, otherUser[0].id))
        .rejects.toThrow(/does not have access/i);
    });
  });

  describe('getActivitiesByClass', () => {
    it('should return activities for class teacher', async () => {
      // Create test activities
      await createActivity(testActivityInput, testTeacher.id);
      await createActivity({
        ...testActivityInput,
        title: 'Second Activity',
        content: 'Second activity content',
      }, testTeacher.id);

      const activities = await getActivitiesByClass(testClass.id, testTeacher.id);

      expect(activities).toHaveLength(2);
      expect(activities[0].title).toEqual('Second Activity'); // Most recent first
      expect(activities[1].title).toEqual('Test Announcement');
    });

    it('should return activities for enrolled student', async () => {
      await createActivity(testActivityInput, testTeacher.id);

      const activities = await getActivitiesByClass(testClass.id, testStudent.id);

      expect(activities).toHaveLength(1);
      expect(activities[0].title).toEqual('Test Announcement');
    });

    it('should order pinned activities first', async () => {
      // Create regular activity
      await createActivity(testActivityInput, testTeacher.id);
      
      // Create pinned activity
      await createActivity({
        ...testActivityInput,
        title: 'Pinned Activity',
        is_pinned: true,
      }, testTeacher.id);

      const activities = await getActivitiesByClass(testClass.id, testTeacher.id);

      expect(activities).toHaveLength(2);
      expect(activities[0].title).toEqual('Pinned Activity'); // Pinned first
      expect(activities[0].is_pinned).toEqual(true);
    });

    it('should throw error for non-enrolled user', async () => {
      const otherUser = await db.insert(usersTable)
        .values({
          email: 'other@test.com',
          password_hash: 'hashedpassword',
          first_name: 'Other',
          last_name: 'User',
          role: 'student',
        })
        .returning()
        .execute();

      await expect(getActivitiesByClass(testClass.id, otherUser[0].id))
        .rejects.toThrow(/does not have access/i);
    });
  });

  describe('updateActivity', () => {
    it('should update activity by author', async () => {
      const activity = await createActivity(testActivityInput, testTeacher.id);

      const result = await updateActivity(activity.id, {
        title: 'Updated Title',
        content: 'Updated content',
      }, testTeacher.id);

      expect(result.title).toEqual('Updated Title');
      expect(result.content).toEqual('Updated content');
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update activity by class teacher', async () => {
      const activity = await createActivity(testActivityInput, testStudent.id);

      const result = await updateActivity(activity.id, {
        content: 'Teacher updated content',
      }, testTeacher.id);

      expect(result.content).toEqual('Teacher updated content');
    });

    it('should throw error for unauthorized user', async () => {
      const activity = await createActivity(testActivityInput, testTeacher.id);

      await expect(updateActivity(activity.id, { content: 'Hacked' }, testStudent.id))
        .rejects.toThrow(/does not have permission/i);
    });

    it('should throw error for non-existent activity', async () => {
      await expect(updateActivity(999, { content: 'Updated' }, testTeacher.id))
        .rejects.toThrow(/not found/i);
    });
  });

  describe('deleteActivity', () => {
    it('should delete activity by author', async () => {
      const activity = await createActivity(testActivityInput, testTeacher.id);

      await deleteActivity(activity.id, testTeacher.id);

      const activities = await db.select()
        .from(activitiesTable)
        .where(eq(activitiesTable.id, activity.id))
        .execute();

      expect(activities).toHaveLength(0);
    });

    it('should delete activity by class teacher', async () => {
      const activity = await createActivity(testActivityInput, testStudent.id);

      await deleteActivity(activity.id, testTeacher.id);

      const activities = await db.select()
        .from(activitiesTable)
        .where(eq(activitiesTable.id, activity.id))
        .execute();

      expect(activities).toHaveLength(0);
    });

    it('should throw error for unauthorized user', async () => {
      const activity = await createActivity(testActivityInput, testTeacher.id);

      await expect(deleteActivity(activity.id, testStudent.id))
        .rejects.toThrow(/does not have permission/i);
    });
  });

  describe('pinActivity', () => {
    it('should pin activity by class teacher', async () => {
      const activity = await createActivity(testActivityInput, testTeacher.id);

      const result = await pinActivity(activity.id, testTeacher.id);

      expect(result.is_pinned).toEqual(true);
    });

    it('should unpin already pinned activity', async () => {
      const activity = await createActivity({
        ...testActivityInput,
        is_pinned: true,
      }, testTeacher.id);

      const result = await pinActivity(activity.id, testTeacher.id);

      expect(result.is_pinned).toEqual(false);
    });

    it('should throw error for non-teacher', async () => {
      const activity = await createActivity(testActivityInput, testTeacher.id);

      await expect(pinActivity(activity.id, testStudent.id))
        .rejects.toThrow(/only the class teacher/i);
    });

    it('should throw error for non-existent activity', async () => {
      await expect(pinActivity(999, testTeacher.id))
        .rejects.toThrow(/not found/i);
    });
  });

  describe('getRecentActivities', () => {
    it('should return recent activities for teacher', async () => {
      await createActivity(testActivityInput, testTeacher.id);
      await createActivity({
        ...testActivityInput,
        title: 'Recent Activity',
        content: 'Recent content',
      }, testTeacher.id);

      const activities = await getRecentActivities(testTeacher.id);

      expect(activities.length).toBeGreaterThan(0);
      expect(activities[0].title).toEqual('Recent Activity'); // Most recent first
    });

    it('should return recent activities for enrolled student', async () => {
      await createActivity(testActivityInput, testTeacher.id);

      const activities = await getRecentActivities(testStudent.id);

      expect(activities.length).toBeGreaterThan(0);
      expect(activities[0].title).toEqual('Test Announcement');
    });

    it('should limit results to 10 activities', async () => {
      // Create more than 10 activities
      for (let i = 0; i < 15; i++) {
        await createActivity({
          ...testActivityInput,
          title: `Activity ${i}`,
        }, testTeacher.id);
      }

      const activities = await getRecentActivities(testTeacher.id);

      expect(activities.length).toBeLessThanOrEqual(10);
    });
  });
});
