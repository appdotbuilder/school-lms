
import { db } from '../db';
import { notificationsTable } from '../db/schema';
import { type Notification } from '../schema';
import { eq, and, desc, asc } from 'drizzle-orm';

export async function getNotificationsByUser(userId: number): Promise<Notification[]> {
  try {
    const results = await db.select()
      .from(notificationsTable)
      .where(eq(notificationsTable.user_id, userId))
      .orderBy(
        asc(notificationsTable.is_read), // false (0) comes before true (1)
        desc(notificationsTable.created_at)
      )
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get notifications:', error);
    throw error;
  }
}

export async function markNotificationAsRead(notificationId: number, userId: number): Promise<Notification> {
  try {
    const results = await db.update(notificationsTable)
      .set({ is_read: true })
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.user_id, userId)
        )
      )
      .returning()
      .execute();

    if (results.length === 0) {
      throw new Error('Notification not found or access denied');
    }

    return results[0];
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    throw error;
  }
}

export async function markAllNotificationsAsRead(userId: number): Promise<void> {
  try {
    await db.update(notificationsTable)
      .set({ is_read: true })
      .where(
        and(
          eq(notificationsTable.user_id, userId),
          eq(notificationsTable.is_read, false)
        )
      )
      .execute();
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    throw error;
  }
}

export async function createNotification(
  userId: number, 
  title: string, 
  message: string, 
  type: string, 
  classId?: number, 
  assignmentId?: number
): Promise<Notification> {
  try {
    const results = await db.insert(notificationsTable)
      .values({
        user_id: userId,
        title,
        message,
        type: type as any, // Type cast since enum validation happens at schema level
        class_id: classId ?? null,
        assignment_id: assignmentId ?? null,
        is_read: false
      })
      .returning()
      .execute();

    return results[0];
  } catch (error) {
    console.error('Failed to create notification:', error);
    throw error;
  }
}

export async function getUnreadNotificationCount(userId: number): Promise<number> {
  try {
    const results = await db.select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.user_id, userId),
          eq(notificationsTable.is_read, false)
        )
      )
      .execute();

    return results.length;
  } catch (error) {
    console.error('Failed to get unread notification count:', error);
    throw error;
  }
}

export async function deleteNotification(notificationId: number, userId: number): Promise<void> {
  try {
    const results = await db.delete(notificationsTable)
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.user_id, userId)
        )
      )
      .returning()
      .execute();

    if (results.length === 0) {
      throw new Error('Notification not found or access denied');
    }
  } catch (error) {
    console.error('Failed to delete notification:', error);
    throw error;
  }
}
