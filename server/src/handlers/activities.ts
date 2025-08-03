
import { db } from '../db';
import { activitiesTable, classesTable, classEnrollmentsTable, usersTable } from '../db/schema';
import { type CreateActivityInput, type Activity } from '../schema';
import { eq, and, desc, or } from 'drizzle-orm';

export async function createActivity(input: CreateActivityInput, authorId: number): Promise<Activity> {
  try {
    // Verify the class exists and user has access (either teacher or enrolled student)
    const classAccess = await db.select()
      .from(classesTable)
      .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.class_id, classesTable.id))
      .where(
        and(
          eq(classesTable.id, input.class_id),
          or(
            eq(classesTable.teacher_id, authorId),
            eq(classEnrollmentsTable.user_id, authorId)
          )
        )
      )
      .execute();

    if (classAccess.length === 0) {
      throw new Error('User does not have access to this class');
    }

    // Insert the activity
    const result = await db.insert(activitiesTable)
      .values({
        class_id: input.class_id,
        author_id: authorId,
        title: input.title || null,
        content: input.content,
        activity_type: input.activity_type,
        is_pinned: input.is_pinned || false,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Activity creation failed:', error);
    throw error;
  }
}

export async function getActivitiesByClass(classId: number, userId: number): Promise<Activity[]> {
  try {
    // Verify user has access to the class
    const classAccess = await db.select()
      .from(classesTable)
      .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.class_id, classesTable.id))
      .where(
        and(
          eq(classesTable.id, classId),
          or(
            eq(classesTable.teacher_id, userId),
            eq(classEnrollmentsTable.user_id, userId)
          )
        )
      )
      .execute();

    if (classAccess.length === 0) {
      throw new Error('User does not have access to this class');
    }

    // Fetch activities ordered by pinned status (pinned first) then by creation date (newest first)
    const activities = await db.select()
      .from(activitiesTable)
      .where(eq(activitiesTable.class_id, classId))
      .orderBy(desc(activitiesTable.is_pinned), desc(activitiesTable.created_at))
      .execute();

    return activities;
  } catch (error) {
    console.error('Failed to get activities by class:', error);
    throw error;
  }
}

export async function updateActivity(activityId: number, input: Partial<CreateActivityInput>, authorId: number): Promise<Activity> {
  try {
    // Get the activity and verify it exists
    const existingActivity = await db.select()
      .from(activitiesTable)
      .innerJoin(classesTable, eq(activitiesTable.class_id, classesTable.id))
      .where(eq(activitiesTable.id, activityId))
      .execute();

    if (existingActivity.length === 0) {
      throw new Error('Activity not found');
    }

    const activity = existingActivity[0].activities;
    const classInfo = existingActivity[0].classes;

    // Verify user can update (either author or class teacher)
    if (activity.author_id !== authorId && classInfo.teacher_id !== authorId) {
      throw new Error('User does not have permission to update this activity');
    }

    // Update the activity
    const updateData: Partial<typeof activitiesTable.$inferInsert> = {
      updated_at: new Date(),
    };

    if (input.title !== undefined) updateData.title = input.title;
    if (input.content !== undefined) updateData.content = input.content;
    if (input.activity_type !== undefined) updateData.activity_type = input.activity_type;
    if (input.is_pinned !== undefined) updateData.is_pinned = input.is_pinned;

    const result = await db.update(activitiesTable)
      .set(updateData)
      .where(eq(activitiesTable.id, activityId))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Activity update failed:', error);
    throw error;
  }
}

export async function deleteActivity(activityId: number, userId: number): Promise<void> {
  try {
    // Get the activity and verify it exists
    const existingActivity = await db.select()
      .from(activitiesTable)
      .innerJoin(classesTable, eq(activitiesTable.class_id, classesTable.id))
      .where(eq(activitiesTable.id, activityId))
      .execute();

    if (existingActivity.length === 0) {
      throw new Error('Activity not found');
    }

    const activity = existingActivity[0].activities;
    const classInfo = existingActivity[0].classes;

    // Verify user can delete (either author or class teacher)
    if (activity.author_id !== userId && classInfo.teacher_id !== userId) {
      throw new Error('User does not have permission to delete this activity');
    }

    // Delete the activity
    await db.delete(activitiesTable)
      .where(eq(activitiesTable.id, activityId))
      .execute();
  } catch (error) {
    console.error('Activity deletion failed:', error);
    throw error;
  }
}

export async function pinActivity(activityId: number, teacherId: number): Promise<Activity> {
  try {
    // Get the activity and verify it exists
    const existingActivity = await db.select()
      .from(activitiesTable)
      .innerJoin(classesTable, eq(activitiesTable.class_id, classesTable.id))
      .where(eq(activitiesTable.id, activityId))
      .execute();

    if (existingActivity.length === 0) {
      throw new Error('Activity not found');
    }

    const classInfo = existingActivity[0].classes;

    // Verify user is the class teacher
    if (classInfo.teacher_id !== teacherId) {
      throw new Error('Only the class teacher can pin activities');
    }

    // Toggle the pinned status
    const currentActivity = existingActivity[0].activities;
    const result = await db.update(activitiesTable)
      .set({
        is_pinned: !currentActivity.is_pinned,
        updated_at: new Date(),
      })
      .where(eq(activitiesTable.id, activityId))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Activity pin/unpin failed:', error);
    throw error;
  }
}

export async function getRecentActivities(userId: number): Promise<Activity[]> {
  try {
    // Get activities from all classes the user is associated with (as teacher or student)
    const activities = await db.select({
      id: activitiesTable.id,
      class_id: activitiesTable.class_id,
      author_id: activitiesTable.author_id,
      title: activitiesTable.title,
      content: activitiesTable.content,
      activity_type: activitiesTable.activity_type,
      is_pinned: activitiesTable.is_pinned,
      created_at: activitiesTable.created_at,
      updated_at: activitiesTable.updated_at,
    })
      .from(activitiesTable)
      .innerJoin(classesTable, eq(activitiesTable.class_id, classesTable.id))
      .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.class_id, classesTable.id))
      .where(
        or(
          eq(classesTable.teacher_id, userId),
          eq(classEnrollmentsTable.user_id, userId)
        )
      )
      .orderBy(desc(activitiesTable.created_at))
      .limit(10)
      .execute();

    return activities;
  } catch (error) {
    console.error('Failed to get recent activities:', error);
    throw error;
  }
}
