
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, notificationsTable, classesTable, assignmentsTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  getNotificationsByUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createNotification,
  getUnreadNotificationCount,
  deleteNotification
} from '../handlers/notifications';

let testUser: { id: number };
let testClass: { id: number };
let testAssignment: { id: number };

describe('Notifications handlers', () => {
  beforeEach(async () => {
    await createDB();
    
    // Create test user
    const userResults = await db.insert(usersTable)
      .values({
        email: 'test@example.com',
        password_hash: 'hashed_password',
        first_name: 'Test',
        last_name: 'User',
        role: 'student'
      })
      .returning()
      .execute();
    
    testUser = userResults[0];

    // Create test class
    const classResults = await db.insert(classesTable)
      .values({
        name: 'Test Class',
        class_code: 'TEST123',
        teacher_id: testUser.id
      })
      .returning()
      .execute();
    
    testClass = classResults[0];

    // Create test assignment
    const assignmentResults = await db.insert(assignmentsTable)
      .values({
        title: 'Test Assignment',
        type: 'assignment',
        class_id: testClass.id,
        teacher_id: testUser.id
      })
      .returning()
      .execute();
    
    testAssignment = assignmentResults[0];
  });

  afterEach(resetDB);

  describe('createNotification', () => {
    it('should create a notification with all fields', async () => {
      const result = await createNotification(
        testUser.id,
        'Test Title',
        'Test message',
        'assignment_posted',
        testClass.id,
        testAssignment.id
      );

      expect(result.user_id).toEqual(testUser.id);
      expect(result.title).toEqual('Test Title');
      expect(result.message).toEqual('Test message');
      expect(result.type).toEqual('assignment_posted');
      expect(result.class_id).toEqual(testClass.id);
      expect(result.assignment_id).toEqual(testAssignment.id);
      expect(result.is_read).toEqual(false);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create a notification with optional fields as null', async () => {
      const result = await createNotification(
        testUser.id,
        'Simple Title',
        'Simple message',
        'class_announcement'
      );

      expect(result.user_id).toEqual(testUser.id);
      expect(result.title).toEqual('Simple Title');
      expect(result.message).toEqual('Simple message');
      expect(result.type).toEqual('class_announcement');
      expect(result.class_id).toBeNull();
      expect(result.assignment_id).toBeNull();
      expect(result.is_read).toEqual(false);
    });

    it('should save notification to database', async () => {
      const result = await createNotification(
        testUser.id,
        'Database Test',
        'Testing database save',
        'grade_received'
      );

      const notifications = await db.select()
        .from(notificationsTable)
        .where(eq(notificationsTable.id, result.id))
        .execute();

      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toEqual('Database Test');
      expect(notifications[0].user_id).toEqual(testUser.id);
    });
  });

  describe('getNotificationsByUser', () => {
    it('should return empty array when no notifications exist', async () => {
      const result = await getNotificationsByUser(testUser.id);
      expect(result).toHaveLength(0);
    });

    it('should return user notifications ordered by read status and date', async () => {
      // Create multiple notifications with small delays to ensure different timestamps
      const notification1 = await createNotification(testUser.id, 'First', 'First message', 'assignment_posted');
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      const notification2 = await createNotification(testUser.id, 'Second', 'Second message', 'grade_received');
      
      // Mark first as read
      await markNotificationAsRead(notification1.id, testUser.id);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      const notification3 = await createNotification(testUser.id, 'Third', 'Third message', 'comment_added');

      const result = await getNotificationsByUser(testUser.id);

      expect(result).toHaveLength(3);
      
      // Unread notifications should come first (is_read = false)
      expect(result[0].is_read).toEqual(false);
      expect(result[1].is_read).toEqual(false);
      expect(result[2].is_read).toEqual(true);
      
      // Among unread, newer should come first
      expect(result[0].title).toEqual('Third');
      expect(result[1].title).toEqual('Second');
      expect(result[2].title).toEqual('First');
    });

    it('should only return notifications for the specified user', async () => {
      // Create another user
      const otherUserResults = await db.insert(usersTable)
        .values({
          email: 'other@example.com',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();
      
      const otherUser = otherUserResults[0];

      // Create notifications for both users
      await createNotification(testUser.id, 'For Test User', 'Test message', 'assignment_posted');
      await createNotification(otherUser.id, 'For Other User', 'Other message', 'grade_received');

      const result = await getNotificationsByUser(testUser.id);

      expect(result).toHaveLength(1);
      expect(result[0].title).toEqual('For Test User');
      expect(result[0].user_id).toEqual(testUser.id);
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read', async () => {
      const notification = await createNotification(testUser.id, 'Test', 'Test message', 'assignment_posted');
      
      const result = await markNotificationAsRead(notification.id, testUser.id);

      expect(result.is_read).toEqual(true);
      expect(result.id).toEqual(notification.id);
      expect(result.title).toEqual('Test');
    });

    it('should update notification in database', async () => {
      const notification = await createNotification(testUser.id, 'Test', 'Test message', 'assignment_posted');
      
      await markNotificationAsRead(notification.id, testUser.id);

      const dbNotifications = await db.select()
        .from(notificationsTable)
        .where(eq(notificationsTable.id, notification.id))
        .execute();

      expect(dbNotifications[0].is_read).toEqual(true);
    });

    it('should throw error when notification not found', async () => {
      await expect(markNotificationAsRead(999, testUser.id)).rejects.toThrow(/not found or access denied/i);
    });

    it('should throw error when user tries to mark another users notification', async () => {
      // Create another user
      const otherUserResults = await db.insert(usersTable)
        .values({
          email: 'other@example.com',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();
      
      const otherUser = otherUserResults[0];
      const notification = await createNotification(otherUser.id, 'Other User Notification', 'Test message', 'assignment_posted');
      
      await expect(markNotificationAsRead(notification.id, testUser.id)).rejects.toThrow(/not found or access denied/i);
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      // Create multiple unread notifications
      await createNotification(testUser.id, 'First', 'First message', 'assignment_posted');
      await createNotification(testUser.id, 'Second', 'Second message', 'grade_received');
      await createNotification(testUser.id, 'Third', 'Third message', 'comment_added');

      await markAllNotificationsAsRead(testUser.id);

      const notifications = await getNotificationsByUser(testUser.id);
      
      expect(notifications).toHaveLength(3);
      notifications.forEach(notification => {
        expect(notification.is_read).toEqual(true);
      });
    });

    it('should not affect already read notifications', async () => {
      const notification1 = await createNotification(testUser.id, 'First', 'First message', 'assignment_posted');
      await markNotificationAsRead(notification1.id, testUser.id);
      
      await createNotification(testUser.id, 'Second', 'Second message', 'grade_received');

      await markAllNotificationsAsRead(testUser.id);

      const notifications = await getNotificationsByUser(testUser.id);
      
      expect(notifications).toHaveLength(2);
      notifications.forEach(notification => {
        expect(notification.is_read).toEqual(true);
      });
    });

    it('should only affect notifications for the specified user', async () => {
      // Create another user
      const otherUserResults = await db.insert(usersTable)
        .values({
          email: 'other@example.com',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();
      
      const otherUser = otherUserResults[0];

      // Create notifications for both users
      await createNotification(testUser.id, 'For Test User', 'Test message', 'assignment_posted');
      await createNotification(otherUser.id, 'For Other User', 'Other message', 'grade_received');

      await markAllNotificationsAsRead(testUser.id);

      const testUserNotifications = await getNotificationsByUser(testUser.id);
      const otherUserNotifications = await getNotificationsByUser(otherUser.id);

      expect(testUserNotifications[0].is_read).toEqual(true);
      expect(otherUserNotifications[0].is_read).toEqual(false);
    });
  });

  describe('getUnreadNotificationCount', () => {
    it('should return 0 when no notifications exist', async () => {
      const count = await getUnreadNotificationCount(testUser.id);
      expect(count).toEqual(0);
    });

    it('should return correct count of unread notifications', async () => {
      // Create notifications
      const notification1 = await createNotification(testUser.id, 'First', 'First message', 'assignment_posted');
      await createNotification(testUser.id, 'Second', 'Second message', 'grade_received');
      await createNotification(testUser.id, 'Third', 'Third message', 'comment_added');

      // Mark one as read
      await markNotificationAsRead(notification1.id, testUser.id);

      const count = await getUnreadNotificationCount(testUser.id);
      expect(count).toEqual(2);
    });

    it('should only count notifications for the specified user', async () => {
      // Create another user
      const otherUserResults = await db.insert(usersTable)
        .values({
          email: 'other@example.com',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();
      
      const otherUser = otherUserResults[0];

      // Create notifications for both users
      await createNotification(testUser.id, 'For Test User', 'Test message', 'assignment_posted');
      await createNotification(otherUser.id, 'For Other User', 'Other message', 'grade_received');

      const count = await getUnreadNotificationCount(testUser.id);
      expect(count).toEqual(1);
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification', async () => {
      const notification = await createNotification(testUser.id, 'Test', 'Test message', 'assignment_posted');
      
      await deleteNotification(notification.id, testUser.id);

      const notifications = await getNotificationsByUser(testUser.id);
      expect(notifications).toHaveLength(0);
    });

    it('should remove notification from database', async () => {
      const notification = await createNotification(testUser.id, 'Test', 'Test message', 'assignment_posted');
      
      await deleteNotification(notification.id, testUser.id);

      const dbNotifications = await db.select()
        .from(notificationsTable)
        .where(eq(notificationsTable.id, notification.id))
        .execute();

      expect(dbNotifications).toHaveLength(0);
    });

    it('should throw error when notification not found', async () => {
      await expect(deleteNotification(999, testUser.id)).rejects.toThrow(/not found or access denied/i);
    });

    it('should throw error when user tries to delete another users notification', async () => {
      // Create another user
      const otherUserResults = await db.insert(usersTable)
        .values({
          email: 'other@example.com',
          password_hash: 'hashed_password',
          first_name: 'Other',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();
      
      const otherUser = otherUserResults[0];
      const notification = await createNotification(otherUser.id, 'Other User Notification', 'Test message', 'assignment_posted');
      
      await expect(deleteNotification(notification.id, testUser.id)).rejects.toThrow(/not found or access denied/i);
    });
  });
});
