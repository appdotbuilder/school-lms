
import { db } from '../db';
import { 
  assignmentsTable, 
  submissionsTable, 
  activitiesTable, 
  notificationsTable, 
  calendarEventsTable,
  gradebookTable,
  classesTable,
  classEnrollmentsTable,
  usersTable
} from '../db/schema';
import { type StudentDashboard, type TeacherDashboard } from '../schema';
import { eq, and, desc, gte, lte, count, isNotNull } from 'drizzle-orm';

export async function getStudentDashboard(studentId: number): Promise<StudentDashboard> {
  try {
    // Get upcoming assignments (due within next 7 days, published, from enrolled classes)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const upcomingAssignments = await db.select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      description: assignmentsTable.description,
      type: assignmentsTable.type,
      class_id: assignmentsTable.class_id,
      teacher_id: assignmentsTable.teacher_id,
      due_date: assignmentsTable.due_date,
      publish_date: assignmentsTable.publish_date,
      max_points: assignmentsTable.max_points,
      allow_late_submission: assignmentsTable.allow_late_submission,
      is_published: assignmentsTable.is_published,
      rubric_data: assignmentsTable.rubric_data,
      created_at: assignmentsTable.created_at,
      updated_at: assignmentsTable.updated_at,
    })
    .from(assignmentsTable)
    .innerJoin(classEnrollmentsTable, eq(assignmentsTable.class_id, classEnrollmentsTable.class_id))
    .where(and(
      eq(classEnrollmentsTable.user_id, studentId),
      eq(assignmentsTable.is_published, true),
      gte(assignmentsTable.due_date, new Date()),
      lte(assignmentsTable.due_date, sevenDaysFromNow)
    ))
    .orderBy(assignmentsTable.due_date)
    .limit(5)
    .execute();

    // Get recent grades (last 10 graded submissions)
    const recentGrades = await db.select({
      id: gradebookTable.id,
      student_id: gradebookTable.student_id,
      class_id: gradebookTable.class_id,
      assignment_id: gradebookTable.assignment_id,
      points_earned: gradebookTable.points_earned,
      points_possible: gradebookTable.points_possible,
      percentage: gradebookTable.percentage,
      letter_grade: gradebookTable.letter_grade,
      is_excused: gradebookTable.is_excused,
      updated_at: gradebookTable.updated_at,
    })
    .from(gradebookTable)
    .where(and(
      eq(gradebookTable.student_id, studentId),
      isNotNull(gradebookTable.points_earned)
    ))
    .orderBy(desc(gradebookTable.updated_at))
    .limit(10)
    .execute();

    // Get recent activities from enrolled classes
    const recentActivities = await db.select({
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
    .innerJoin(classEnrollmentsTable, eq(activitiesTable.class_id, classEnrollmentsTable.class_id))
    .where(eq(classEnrollmentsTable.user_id, studentId))
    .orderBy(desc(activitiesTable.created_at))
    .limit(10)
    .execute();

    // Get unread notifications
    const notifications = await db.select({
      id: notificationsTable.id,
      user_id: notificationsTable.user_id,
      title: notificationsTable.title,
      message: notificationsTable.message,
      type: notificationsTable.type,
      class_id: notificationsTable.class_id,
      assignment_id: notificationsTable.assignment_id,
      is_read: notificationsTable.is_read,
      created_at: notificationsTable.created_at,
    })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.user_id, studentId),
      eq(notificationsTable.is_read, false)
    ))
    .orderBy(desc(notificationsTable.created_at))
    .limit(15)
    .execute();

    // Get upcoming calendar events (next 14 days)
    const fourteenDaysFromNow = new Date();
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

    const calendarEvents = await db.select({
      id: calendarEventsTable.id,
      title: calendarEventsTable.title,
      description: calendarEventsTable.description,
      class_id: calendarEventsTable.class_id,
      assignment_id: calendarEventsTable.assignment_id,
      event_date: calendarEventsTable.event_date,
      event_type: calendarEventsTable.event_type,
      created_by: calendarEventsTable.created_by,
      created_at: calendarEventsTable.created_at,
    })
    .from(calendarEventsTable)
    .innerJoin(classEnrollmentsTable, eq(calendarEventsTable.class_id, classEnrollmentsTable.class_id))
    .where(and(
      eq(classEnrollmentsTable.user_id, studentId),
      gte(calendarEventsTable.event_date, new Date()),
      lte(calendarEventsTable.event_date, fourteenDaysFromNow)
    ))
    .orderBy(calendarEventsTable.event_date)
    .limit(10)
    .execute();

    return {
      upcomingAssignments,
      recentGrades,
      recentActivities,
      notifications,
      calendarEvents,
    };
  } catch (error) {
    console.error('Student dashboard retrieval failed:', error);
    throw error;
  }
}

export async function getTeacherDashboard(teacherId: number): Promise<TeacherDashboard> {
  try {
    // Get recent assignments created by teacher
    const recentAssignments = await db.select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      description: assignmentsTable.description,
      type: assignmentsTable.type,
      class_id: assignmentsTable.class_id,
      teacher_id: assignmentsTable.teacher_id,
      due_date: assignmentsTable.due_date,
      publish_date: assignmentsTable.publish_date,
      max_points: assignmentsTable.max_points,
      allow_late_submission: assignmentsTable.allow_late_submission,
      is_published: assignmentsTable.is_published,
      rubric_data: assignmentsTable.rubric_data,
      created_at: assignmentsTable.created_at,
      updated_at: assignmentsTable.updated_at,
    })
    .from(assignmentsTable)
    .where(eq(assignmentsTable.teacher_id, teacherId))
    .orderBy(desc(assignmentsTable.created_at))
    .limit(10)
    .execute();

    // Get pending submissions (submitted but not graded)
    const pendingSubmissions = await db.select({
      id: submissionsTable.id,
      assignment_id: submissionsTable.assignment_id,
      student_id: submissionsTable.student_id,
      content: submissionsTable.content,
      status: submissionsTable.status,
      points_earned: submissionsTable.points_earned,
      grade_feedback: submissionsTable.grade_feedback,
      submitted_at: submissionsTable.submitted_at,
      graded_at: submissionsTable.graded_at,
      graded_by: submissionsTable.graded_by,
      created_at: submissionsTable.created_at,
      updated_at: submissionsTable.updated_at,
    })
    .from(submissionsTable)
    .innerJoin(assignmentsTable, eq(submissionsTable.assignment_id, assignmentsTable.id))
    .where(and(
      eq(assignmentsTable.teacher_id, teacherId),
      eq(submissionsTable.status, 'submitted')
    ))
    .orderBy(desc(submissionsTable.submitted_at))
    .limit(15)
    .execute();

    // Get recent activities from teacher's classes
    const recentActivities = await db.select({
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
    .where(eq(classesTable.teacher_id, teacherId))
    .orderBy(desc(activitiesTable.created_at))
    .limit(10)
    .execute();

    // Get upcoming assignment deadlines (next 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const upcomingDeadlines = await db.select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      description: assignmentsTable.description,
      type: assignmentsTable.type,
      class_id: assignmentsTable.class_id,
      teacher_id: assignmentsTable.teacher_id,
      due_date: assignmentsTable.due_date,
      publish_date: assignmentsTable.publish_date,
      max_points: assignmentsTable.max_points,
      allow_late_submission: assignmentsTable.allow_late_submission,
      is_published: assignmentsTable.is_published,
      rubric_data: assignmentsTable.rubric_data,
      created_at: assignmentsTable.created_at,
      updated_at: assignmentsTable.updated_at,
    })
    .from(assignmentsTable)
    .where(and(
      eq(assignmentsTable.teacher_id, teacherId),
      eq(assignmentsTable.is_published, true),
      gte(assignmentsTable.due_date, new Date()),
      lte(assignmentsTable.due_date, sevenDaysFromNow)
    ))
    .orderBy(assignmentsTable.due_date)
    .limit(8)
    .execute();

    // Get class statistics
    const totalClassesResult = await db.select({ count: count() })
      .from(classesTable)
      .where(eq(classesTable.teacher_id, teacherId))
      .execute();

    const totalStudentsResult = await db.select({ count: count() })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classEnrollmentsTable.class_id, classesTable.id))
      .where(eq(classesTable.teacher_id, teacherId))
      .execute();

    const pendingGradesResult = await db.select({ count: count() })
      .from(submissionsTable)
      .innerJoin(assignmentsTable, eq(submissionsTable.assignment_id, assignmentsTable.id))
      .where(and(
        eq(assignmentsTable.teacher_id, teacherId),
        eq(submissionsTable.status, 'submitted')
      ))
      .execute();

    const classStats = {
      totalClasses: totalClassesResult[0]?.count || 0,
      totalStudents: totalStudentsResult[0]?.count || 0,
      pendingGrades: pendingGradesResult[0]?.count || 0,
    };

    return {
      recentAssignments,
      pendingSubmissions,
      recentActivities,
      upcomingDeadlines,
      classStats,
    };
  } catch (error) {
    console.error('Teacher dashboard retrieval failed:', error);
    throw error;
  }
}

export async function getClassStatistics(classId: number, teacherId: number): Promise<any> {
  try {
    // Verify teacher owns this class
    const classCheck = await db.select()
      .from(classesTable)
      .where(and(
        eq(classesTable.id, classId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (classCheck.length === 0) {
      throw new Error('Class not found or unauthorized');
    }

    // Get total students enrolled
    const totalStudentsResult = await db.select({ count: count() })
      .from(classEnrollmentsTable)
      .where(eq(classEnrollmentsTable.class_id, classId))
      .execute();

    // Get total assignments for this class
    const totalAssignmentsResult = await db.select({ count: count() })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.class_id, classId))
      .execute();

    // Get average grade for the class (from gradebook)
    const gradeResults = await db.select({
      percentage: gradebookTable.percentage
    })
    .from(gradebookTable)
    .where(and(
      eq(gradebookTable.class_id, classId),
      isNotNull(gradebookTable.percentage)
    ))
    .execute();

    const averageGrade = gradeResults.length > 0 
      ? gradeResults.reduce((sum, grade) => sum + (grade.percentage || 0), 0) / gradeResults.length 
      : 0;

    // Get completion rate (submitted vs total possible submissions)
    const totalPossibleSubmissionsResult = await db.select({ count: count() })
      .from(assignmentsTable)
      .innerJoin(classEnrollmentsTable, eq(assignmentsTable.class_id, classEnrollmentsTable.class_id))
      .where(and(
        eq(assignmentsTable.class_id, classId),
        eq(assignmentsTable.is_published, true)
      ))
      .execute();

    const completedSubmissionsResult = await db.select({ count: count() })
      .from(submissionsTable)
      .innerJoin(assignmentsTable, eq(submissionsTable.assignment_id, assignmentsTable.id))
      .where(and(
        eq(assignmentsTable.class_id, classId),
        eq(submissionsTable.status, 'submitted')
      ))
      .execute();

    const totalPossible = totalPossibleSubmissionsResult[0]?.count || 0;
    const completed = completedSubmissionsResult[0]?.count || 0;
    const completionRate = totalPossible > 0 ? (completed / totalPossible) * 100 : 0;

    // Get recent activity count (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivityResult = await db.select({ count: count() })
      .from(activitiesTable)
      .where(and(
        eq(activitiesTable.class_id, classId),
        gte(activitiesTable.created_at, sevenDaysAgo)
      ))
      .execute();

    return {
      totalStudents: totalStudentsResult[0]?.count || 0,
      totalAssignments: totalAssignmentsResult[0]?.count || 0,
      averageGrade: Math.round(averageGrade * 100) / 100, // Round to 2 decimal places
      completionRate: Math.round(completionRate * 100) / 100,
      recentActivity: recentActivityResult[0]?.count || 0,
    };
  } catch (error) {
    console.error('Class statistics retrieval failed:', error);
    throw error;
  }
}

export async function getOverallStatistics(teacherId: number): Promise<any> {
  try {
    // Get total classes
    const totalClassesResult = await db.select({ count: count() })
      .from(classesTable)
      .where(eq(classesTable.teacher_id, teacherId))
      .execute();

    // Get total students across all classes
    const totalStudentsResult = await db.select({ count: count() })
      .from(classEnrollmentsTable)
      .innerJoin(classesTable, eq(classEnrollmentsTable.class_id, classesTable.id))
      .where(eq(classesTable.teacher_id, teacherId))
      .execute();

    // Get total assignments
    const totalAssignmentsResult = await db.select({ count: count() })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.teacher_id, teacherId))
      .execute();

    // Get pending grades count
    const pendingGradesResult = await db.select({ count: count() })
      .from(submissionsTable)
      .innerJoin(assignmentsTable, eq(submissionsTable.assignment_id, assignmentsTable.id))
      .where(and(
        eq(assignmentsTable.teacher_id, teacherId),
        eq(submissionsTable.status, 'submitted')
      ))
      .execute();

    // Get this week's activity (submissions + activities)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const submissionActivityResult = await db.select({ count: count() })
      .from(submissionsTable)
      .innerJoin(assignmentsTable, eq(submissionsTable.assignment_id, assignmentsTable.id))
      .where(and(
        eq(assignmentsTable.teacher_id, teacherId),
        gte(submissionsTable.created_at, oneWeekAgo)
      ))
      .execute();

    const classActivityResult = await db.select({ count: count() })
      .from(activitiesTable)
      .innerJoin(classesTable, eq(activitiesTable.class_id, classesTable.id))
      .where(and(
        eq(classesTable.teacher_id, teacherId),
        gte(activitiesTable.created_at, oneWeekAgo)
      ))
      .execute();

    const thisWeekActivity = (submissionActivityResult[0]?.count || 0) + (classActivityResult[0]?.count || 0);

    return {
      totalClasses: totalClassesResult[0]?.count || 0,
      totalStudents: totalStudentsResult[0]?.count || 0,
      totalAssignments: totalAssignmentsResult[0]?.count || 0,
      pendingGrades: pendingGradesResult[0]?.count || 0,
      thisWeekActivity,
    };
  } catch (error) {
    console.error('Overall statistics retrieval failed:', error);
    throw error;
  }
}
