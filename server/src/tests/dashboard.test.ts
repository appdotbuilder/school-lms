
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  usersTable, 
  classesTable, 
  classEnrollmentsTable,
  assignmentsTable,
  submissionsTable,
  activitiesTable,
  notificationsTable,
  calendarEventsTable,
  gradebookTable
} from '../db/schema';
import { 
  getStudentDashboard, 
  getTeacherDashboard, 
  getClassStatistics, 
  getOverallStatistics 
} from '../handlers/dashboard';

// Test data
const testTeacher = {
  email: 'teacher@test.com',
  password_hash: 'hashedpassword',
  first_name: 'John',
  last_name: 'Teacher',
  role: 'teacher' as const,
  is_active: true,
};

const testStudent = {
  email: 'student@test.com',
  password_hash: 'hashedpassword',
  first_name: 'Jane',
  last_name: 'Student',
  role: 'student' as const,
  is_active: true,
};

const testClass = {
  name: 'Test Class',
  description: 'A test class',
  class_code: 'TEST123',
  teacher_id: 1,
  is_archived: false,
};

describe('Dashboard Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getStudentDashboard', () => {
    it('should return student dashboard data with upcoming assignments', async () => {
      // Create teacher and student
      const teacherResult = await db.insert(usersTable).values(testTeacher).returning().execute();
      const studentResult = await db.insert(usersTable).values(testStudent).returning().execute();
      
      const teacherId = teacherResult[0].id;
      const studentId = studentResult[0].id;

      // Create class
      const classResult = await db.insert(classesTable)
        .values({ ...testClass, teacher_id: teacherId })
        .returning()
        .execute();
      const classId = classResult[0].id;

      // Enroll student
      await db.insert(classEnrollmentsTable)
        .values({ user_id: studentId, class_id: classId })
        .execute();

      // Create upcoming assignment (due in 3 days)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);

      await db.insert(assignmentsTable)
        .values({
          title: 'Upcoming Assignment',
          description: 'Due soon',
          type: 'assignment',
          class_id: classId,
          teacher_id: teacherId,
          due_date: futureDate,
          is_published: true,
          max_points: 100,
          allow_late_submission: false,
        })
        .execute();

      // Get dashboard
      const dashboard = await getStudentDashboard(studentId);

      expect(dashboard.upcomingAssignments).toHaveLength(1);
      expect(dashboard.upcomingAssignments[0].title).toBe('Upcoming Assignment');
      expect(dashboard.recentGrades).toHaveLength(0);
      expect(dashboard.recentActivities).toHaveLength(0);
      expect(dashboard.notifications).toHaveLength(0);
      expect(dashboard.calendarEvents).toHaveLength(0);
    });

    it('should return recent grades for student', async () => {
      // Create teacher and student
      const teacherResult = await db.insert(usersTable).values(testTeacher).returning().execute();
      const studentResult = await db.insert(usersTable).values(testStudent).returning().execute();
      
      const teacherId = teacherResult[0].id;
      const studentId = studentResult[0].id;

      // Create class and enrollment
      const classResult = await db.insert(classesTable)
        .values({ ...testClass, teacher_id: teacherId })
        .returning()
        .execute();
      const classId = classResult[0].id;

      await db.insert(classEnrollmentsTable)
        .values({ user_id: studentId, class_id: classId })
        .execute();

      // Create assignment
      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Graded Assignment',
          type: 'assignment',
          class_id: classId,
          teacher_id: teacherId,
          is_published: true,
          max_points: 100,
          allow_late_submission: false,
        })
        .returning()
        .execute();

      // Create gradebook entry
      await db.insert(gradebookTable)
        .values({
          student_id: studentId,
          class_id: classId,
          assignment_id: assignmentResult[0].id,
          points_earned: 85,
          points_possible: 100,
          percentage: 85,
          is_excused: false,
        })
        .execute();

      const dashboard = await getStudentDashboard(studentId);

      expect(dashboard.recentGrades).toHaveLength(1);
      expect(dashboard.recentGrades[0].points_earned).toBe(85);
      expect(dashboard.recentGrades[0].percentage).toBe(85);
    });

    it('should return notifications for student', async () => {
      // Create student
      const studentResult = await db.insert(usersTable).values(testStudent).returning().execute();
      const studentId = studentResult[0].id;

      // Create notification
      await db.insert(notificationsTable)
        .values({
          user_id: studentId,
          title: 'Test Notification',
          message: 'You have a new assignment',
          type: 'assignment_posted',
          is_read: false,
        })
        .execute();

      const dashboard = await getStudentDashboard(studentId);

      expect(dashboard.notifications).toHaveLength(1);
      expect(dashboard.notifications[0].title).toBe('Test Notification');
      expect(dashboard.notifications[0].is_read).toBe(false);
    });
  });

  describe('getTeacherDashboard', () => {
    it('should return teacher dashboard with recent assignments', async () => {
      // Create teacher
      const teacherResult = await db.insert(usersTable).values(testTeacher).returning().execute();
      const teacherId = teacherResult[0].id;

      // Create class
      const classResult = await db.insert(classesTable)
        .values({ ...testClass, teacher_id: teacherId })
        .returning()
        .execute();
      const classId = classResult[0].id;

      // Create assignment
      await db.insert(assignmentsTable)
        .values({
          title: 'Recent Assignment',
          type: 'assignment',
          class_id: classId,
          teacher_id: teacherId,
          is_published: true,
          max_points: 100,
          allow_late_submission: false,
        })
        .execute();

      const dashboard = await getTeacherDashboard(teacherId);

      expect(dashboard.recentAssignments).toHaveLength(1);
      expect(dashboard.recentAssignments[0].title).toBe('Recent Assignment');
      expect(dashboard.pendingSubmissions).toHaveLength(0);
      expect(dashboard.classStats.totalClasses).toBe(1);
    });

    it('should return pending submissions', async () => {
      // Create teacher and student
      const teacherResult = await db.insert(usersTable).values(testTeacher).returning().execute();
      const studentResult = await db.insert(usersTable).values(testStudent).returning().execute();
      
      const teacherId = teacherResult[0].id;
      const studentId = studentResult[0].id;

      // Create class and assignment
      const classResult = await db.insert(classesTable)
        .values({ ...testClass, teacher_id: teacherId })
        .returning()
        .execute();
      const classId = classResult[0].id;

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Assignment with Submission',
          type: 'assignment',
          class_id: classId,
          teacher_id: teacherId,
          is_published: true,
          max_points: 100,
          allow_late_submission: false,
        })
        .returning()
        .execute();

      // Create pending submission
      await db.insert(submissionsTable)
        .values({
          assignment_id: assignmentResult[0].id,
          student_id: studentId,
          content: 'Student submission',
          status: 'submitted',
          submitted_at: new Date(),
        })
        .execute();

      const dashboard = await getTeacherDashboard(teacherId);

      expect(dashboard.pendingSubmissions).toHaveLength(1);
      expect(dashboard.pendingSubmissions[0].status).toBe('submitted');
      expect(dashboard.classStats.pendingGrades).toBe(1);
    });

    it('should calculate class statistics correctly', async () => {
      // Create teacher and multiple students
      const teacherResult = await db.insert(usersTable).values(testTeacher).returning().execute();
      const student1Result = await db.insert(usersTable)
        .values({ ...testStudent, email: 'student1@test.com' })
        .returning()
        .execute();
      const student2Result = await db.insert(usersTable)
        .values({ ...testStudent, email: 'student2@test.com' })
        .returning()
        .execute();
      
      const teacherId = teacherResult[0].id;

      // Create two classes
      const class1Result = await db.insert(classesTable)
        .values({ ...testClass, teacher_id: teacherId })
        .returning()
        .execute();
      const class2Result = await db.insert(classesTable)
        .values({ ...testClass, name: 'Second Class', class_code: 'TEST456', teacher_id: teacherId })
        .returning()
        .execute();

      // Enroll students
      await db.insert(classEnrollmentsTable)
        .values({ user_id: student1Result[0].id, class_id: class1Result[0].id })
        .execute();
      await db.insert(classEnrollmentsTable)
        .values({ user_id: student2Result[0].id, class_id: class2Result[0].id })
        .execute();

      const dashboard = await getTeacherDashboard(teacherId);

      expect(dashboard.classStats.totalClasses).toBe(2);
      expect(dashboard.classStats.totalStudents).toBe(2);
      expect(dashboard.classStats.pendingGrades).toBe(0);
    });
  });

  describe('getClassStatistics', () => {
    it('should return class statistics', async () => {
      // Create teacher and students
      const teacherResult = await db.insert(usersTable).values(testTeacher).returning().execute();
      const student1Result = await db.insert(usersTable)
        .values({ ...testStudent, email: 'student1@test.com' })
        .returning()
        .execute();
      const student2Result = await db.insert(usersTable)
        .values({ ...testStudent, email: 'student2@test.com' })
        .returning()
        .execute();
      
      
      const teacherId = teacherResult[0].id;

      // Create class
      const class1Result = await db.insert(classesTable)
        .values({ ...testClass, teacher_id: teacherId })
        .returning()
        .execute();
      const classId = class1Result[0].id;

      // Enroll students
      await db.insert(classEnrollmentsTable)
        .values({ user_id: student1Result[0].id, class_id: classId })
        .execute();
      await db.insert(classEnrollmentsTable)
        .values({ user_id: student2Result[0].id, class_id: classId })
        .execute();

      // Create assignment
      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Test Assignment',
          type: 'assignment',
          class_id: classId,
          teacher_id: teacherId,
          is_published: true,
          max_points: 100,
          allow_late_submission: false,
        })
        .returning()
        .execute();

      // Add grades
      await db.insert(gradebookTable)
        .values({
          student_id: student1Result[0].id,
          class_id: classId,
          assignment_id: assignmentResult[0].id,
          points_earned: 90,
          points_possible: 100,
          percentage: 90,
          is_excused: false,
        })
        .execute();

      const stats = await getClassStatistics(classId, teacherId);

      expect(stats.totalStudents).toBe(2);
      expect(stats.totalAssignments).toBe(1);
      expect(stats.averageGrade).toBe(90);
      expect(stats.recentActivity).toBe(0);
    });

    it('should throw error for unauthorized class access', async () => {
      // Create teacher
      const teacherResult = await db.insert(usersTable).values(testTeacher).returning().execute();
      const teacherId = teacherResult[0].id;

      // Try to access non-existent class
      await expect(getClassStatistics(999, teacherId)).rejects.toThrow(/not found or unauthorized/i);
    });
  });

  describe('getOverallStatistics', () => {
    it('should return overall teacher statistics', async () => {
      // Create teacher
      const teacherResult = await db.insert(usersTable).values(testTeacher).returning().execute();
      const teacherId = teacherResult[0].id;

      // Create class
      const classResult = await db.insert(classesTable)
        .values({ ...testClass, teacher_id: teacherId })
        .returning()
        .execute();

      // Create assignment
      await db.insert(assignmentsTable)
        .values({
          title: 'Test Assignment',
          type: 'assignment',
          class_id: classResult[0].id,
          teacher_id: teacherId,
          is_published: true,
          max_points: 100,
          allow_late_submission: false,
        })
        .execute();

      const stats = await getOverallStatistics(teacherId);

      expect(stats.totalClasses).toBe(1);
      expect(stats.totalStudents).toBe(0);
      expect(stats.totalAssignments).toBe(1);
      expect(stats.pendingGrades).toBe(0);
      expect(stats.thisWeekActivity).toBe(0);
    });

    it('should count weekly activity correctly', async () => {
      // Create teacher and student
      const teacherResult = await db.insert(usersTable).values(testTeacher).returning().execute();
      const studentResult = await db.insert(usersTable).values(testStudent).returning().execute();
      
      const teacherId = teacherResult[0].id;
      const studentId = studentResult[0].id;

      // Create class
      const classResult = await db.insert(classesTable)
        .values({ ...testClass, teacher_id: teacherId })
        .returning()
        .execute();
      const classId = classResult[0].id;

      // Create assignment
      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Test Assignment',
          type: 'assignment',
          class_id: classId,
          teacher_id: teacherId,
          is_published: true,
          max_points: 100,
          allow_late_submission: false,
        })
        .returning()
        .execute();

      // Create recent activity
      await db.insert(activitiesTable)
        .values({
          class_id: classId,
          author_id: teacherId,
          content: 'Recent announcement',
          activity_type: 'announcement',
          is_pinned: false,
        })
        .execute();

      // Create recent submission
      await db.insert(submissionsTable)
        .values({
          assignment_id: assignmentResult[0].id,
          student_id: studentId,
          content: 'Recent submission',
          status: 'submitted',
          submitted_at: new Date(),
        })
        .execute();

      const stats = await getOverallStatistics(teacherId);

      expect(stats.thisWeekActivity).toBe(2); // 1 activity + 1 submission
    });
  });
});
