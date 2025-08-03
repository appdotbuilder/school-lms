
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import { 
  createUserInputSchema, 
  loginInputSchema,
  createClassInputSchema,
  joinClassInputSchema,
  createAssignmentInputSchema,
  createSubmissionInputSchema,
  gradeSubmissionInputSchema,
  createQuizQuestionInputSchema,
  createActivityInputSchema,
  createCommentInputSchema,
  uploadFileInputSchema
} from './schema';

// Import handlers
import { registerUser, loginUser, getCurrentUser } from './handlers/auth';
import { createClass, getClassesByUser, getClassById, joinClass, archiveClass, getClassStudents } from './handlers/classes';
import { createAssignment, getAssignmentsByClass, getAssignmentById, getUpcomingAssignments, updateAssignment, deleteAssignment } from './handlers/assignments';
import { createSubmission, getSubmissionsByAssignment, getSubmissionByStudent, gradeSubmission, getPendingSubmissions, returnSubmissionForRevision } from './handlers/submissions';
import { createQuizQuestion, getQuizQuestions, updateQuizQuestion, deleteQuizQuestion, submitQuizAnswers, getQuizResults } from './handlers/quizzes';
import { createActivity, getActivitiesByClass, updateActivity, deleteActivity, pinActivity, getRecentActivities } from './handlers/activities';
import { createComment, getCommentsByActivity, getCommentsByAssignment, updateComment, deleteComment, getCommentThread } from './handlers/comments';
import { uploadFile, getFilesByClass, getFilesByAssignment, downloadFile, deleteFile, getFileById } from './handlers/files';
import { getNotificationsByUser, markNotificationAsRead, markAllNotificationsAsRead, createNotification, getUnreadNotificationCount, deleteNotification } from './handlers/notifications';
import { getGradebookByClass, getStudentGrades, updateGradebookEntry, excuseAssignment, getClassAverages, exportGradebook } from './handlers/gradebook';
import { getCalendarEvents, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getUpcomingDeadlines, getCalendarEventsByClass } from './handlers/calendar';
import { getStudentDashboard, getTeacherDashboard, getClassStatistics, getOverallStatistics } from './handlers/dashboard';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  register: publicProcedure
    .input(createUserInputSchema)
    .mutation(({ input }) => registerUser(input)),
  
  login: publicProcedure
    .input(loginInputSchema)
    .mutation(({ input }) => loginUser(input)),
  
  getCurrentUser: publicProcedure
    .input(z.number())
    .query(({ input }) => getCurrentUser(input)),

  // Class management routes
  createClass: publicProcedure
    .input(createClassInputSchema)
    .mutation(({ input }) => createClass(input, 1)), // TODO: Get teacherId from auth context
  
  getMyClasses: publicProcedure
    .input(z.object({ userId: z.number(), role: z.enum(['student', 'teacher']) }))
    .query(({ input }) => getClassesByUser(input.userId, input.role)),
  
  getClass: publicProcedure
    .input(z.object({ classId: z.number(), userId: z.number() }))
    .query(({ input }) => getClassById(input.classId, input.userId)),
  
  joinClass: publicProcedure
    .input(joinClassInputSchema)
    .mutation(({ input }) => joinClass(input, 1)), // TODO: Get studentId from auth context
  
  archiveClass: publicProcedure
    .input(z.object({ classId: z.number(), teacherId: z.number() }))
    .mutation(({ input }) => archiveClass(input.classId, input.teacherId)),
  
  getClassStudents: publicProcedure
    .input(z.object({ classId: z.number(), teacherId: z.number() }))
    .query(({ input }) => getClassStudents(input.classId, input.teacherId)),

  // Assignment routes
  createAssignment: publicProcedure
    .input(createAssignmentInputSchema)
    .mutation(({ input }) => createAssignment(input, 1)), // TODO: Get teacherId from auth context
  
  getAssignmentsByClass: publicProcedure
    .input(z.object({ classId: z.number(), userId: z.number() }))
    .query(({ input }) => getAssignmentsByClass(input.classId, input.userId)),
  
  getAssignment: publicProcedure
    .input(z.object({ assignmentId: z.number(), userId: z.number() }))
    .query(({ input }) => getAssignmentById(input.assignmentId, input.userId)),
  
  getUpcomingAssignments: publicProcedure
    .input(z.number())
    .query(({ input }) => getUpcomingAssignments(input)),
  
  updateAssignment: publicProcedure
    .input(z.object({ assignmentId: z.number(), data: createAssignmentInputSchema.partial(), teacherId: z.number() }))
    .mutation(({ input }) => updateAssignment(input.assignmentId, input.data, input.teacherId)),
  
  deleteAssignment: publicProcedure
    .input(z.object({ assignmentId: z.number(), teacherId: z.number() }))
    .mutation(({ input }) => deleteAssignment(input.assignmentId, input.teacherId)),

  // Submission routes
  createSubmission: publicProcedure
    .input(createSubmissionInputSchema)
    .mutation(({ input }) => createSubmission(input, 1)), // TODO: Get studentId from auth context
  
  getSubmissionsByAssignment: publicProcedure
    .input(z.object({ assignmentId: z.number(), teacherId: z.number() }))
    .query(({ input }) => getSubmissionsByAssignment(input.assignmentId, input.teacherId)),
  
  getMySubmission: publicProcedure
    .input(z.object({ assignmentId: z.number(), studentId: z.number() }))
    .query(({ input }) => getSubmissionByStudent(input.assignmentId, input.studentId)),
  
  gradeSubmission: publicProcedure
    .input(gradeSubmissionInputSchema)
    .mutation(({ input }) => gradeSubmission(input, 1)), // TODO: Get teacherId from auth context
  
  getPendingSubmissions: publicProcedure
    .input(z.number())
    .query(({ input }) => getPendingSubmissions(input)),
  
  returnSubmissionForRevision: publicProcedure
    .input(z.object({ submissionId: z.number(), feedback: z.string(), teacherId: z.number() }))
    .mutation(({ input }) => returnSubmissionForRevision(input.submissionId, input.feedback, input.teacherId)),

  // Quiz routes
  createQuizQuestion: publicProcedure
    .input(createQuizQuestionInputSchema)
    .mutation(({ input }) => createQuizQuestion(input)),
  
  getQuizQuestions: publicProcedure
    .input(z.object({ assignmentId: z.number(), userId: z.number() }))
    .query(({ input }) => getQuizQuestions(input.assignmentId, input.userId)),
  
  updateQuizQuestion: publicProcedure
    .input(z.object({ questionId: z.number(), data: createQuizQuestionInputSchema.partial(), teacherId: z.number() }))
    .mutation(({ input }) => updateQuizQuestion(input.questionId, input.data, input.teacherId)),
  
  deleteQuizQuestion: publicProcedure
    .input(z.object({ questionId: z.number(), teacherId: z.number() }))
    .mutation(({ input }) => deleteQuizQuestion(input.questionId, input.teacherId)),
  
  submitQuizAnswers: publicProcedure
    .input(z.object({ submissionId: z.number(), answers: z.array(z.object({ questionId: z.number(), answerText: z.string() })) }))
    .mutation(({ input }) => submitQuizAnswers(input.submissionId, input.answers)),
  
  getQuizResults: publicProcedure
    .input(z.object({ assignmentId: z.number(), teacherId: z.number() }))
    .query(({ input }) => getQuizResults(input.assignmentId, input.teacherId)),

  // Activity stream routes
  createActivity: publicProcedure
    .input(createActivityInputSchema)
    .mutation(({ input }) => createActivity(input, 1)), // TODO: Get authorId from auth context
  
  getActivitiesByClass: publicProcedure
    .input(z.object({ classId: z.number(), userId: z.number() }))
    .query(({ input }) => getActivitiesByClass(input.classId, input.userId)),
  
  updateActivity: publicProcedure
    .input(z.object({ activityId: z.number(), data: createActivityInputSchema.partial(), authorId: z.number() }))
    .mutation(({ input }) => updateActivity(input.activityId, input.data, input.authorId)),
  
  deleteActivity: publicProcedure
    .input(z.object({ activityId: z.number(), userId: z.number() }))
    .mutation(({ input }) => deleteActivity(input.activityId, input.userId)),
  
  pinActivity: publicProcedure
    .input(z.object({ activityId: z.number(), teacherId: z.number() }))
    .mutation(({ input }) => pinActivity(input.activityId, input.teacherId)),
  
  getRecentActivities: publicProcedure
    .input(z.number())
    .query(({ input }) => getRecentActivities(input)),

  // Comment routes
  createComment: publicProcedure
    .input(createCommentInputSchema)
    .mutation(({ input }) => createComment(input, 1)), // TODO: Get authorId from auth context
  
  getCommentsByActivity: publicProcedure
    .input(z.object({ activityId: z.number(), userId: z.number() }))
    .query(({ input }) => getCommentsByActivity(input.activityId, input.userId)),
  
  getCommentsByAssignment: publicProcedure
    .input(z.object({ assignmentId: z.number(), userId: z.number() }))
    .query(({ input }) => getCommentsByAssignment(input.assignmentId, input.userId)),
  
  updateComment: publicProcedure
    .input(z.object({ commentId: z.number(), content: z.string(), authorId: z.number() }))
    .mutation(({ input }) => updateComment(input.commentId, input.content, input.authorId)),
  
  deleteComment: publicProcedure
    .input(z.object({ commentId: z.number(), userId: z.number() }))
    .mutation(({ input }) => deleteComment(input.commentId, input.userId)),
  
  getCommentThread: publicProcedure
    .input(z.object({ commentId: z.number(), userId: z.number() }))
    .query(({ input }) => getCommentThread(input.commentId, input.userId)),

  // File management routes
  uploadFile: publicProcedure
    .input(uploadFileInputSchema)
    .mutation(({ input }) => uploadFile(input, 1, Buffer.from(''))), // TODO: Get uploadedBy from auth context and handle file buffer
  
  getFilesByClass: publicProcedure
    .input(z.object({ classId: z.number(), userId: z.number() }))
    .query(({ input }) => getFilesByClass(input.classId, input.userId)),
  
  getFilesByAssignment: publicProcedure
    .input(z.object({ assignmentId: z.number(), userId: z.number() }))
    .query(({ input }) => getFilesByAssignment(input.assignmentId, input.userId)),
  
  downloadFile: publicProcedure
    .input(z.object({ fileId: z.number(), userId: z.number() }))
    .query(({ input }) => downloadFile(input.fileId, input.userId)),
  
  deleteFile: publicProcedure
    .input(z.object({ fileId: z.number(), userId: z.number() }))
    .mutation(({ input }) => deleteFile(input.fileId, input.userId)),
  
  getFile: publicProcedure
    .input(z.object({ fileId: z.number(), userId: z.number() }))
    .query(({ input }) => getFileById(input.fileId, input.userId)),

  // Notification routes
  getNotifications: publicProcedure
    .input(z.number())
    .query(({ input }) => getNotificationsByUser(input)),
  
  markNotificationAsRead: publicProcedure
    .input(z.object({ notificationId: z.number(), userId: z.number() }))
    .mutation(({ input }) => markNotificationAsRead(input.notificationId, input.userId)),
  
  markAllNotificationsAsRead: publicProcedure
    .input(z.number())
    .mutation(({ input }) => markAllNotificationsAsRead(input)),
  
  getUnreadNotificationCount: publicProcedure
    .input(z.number())
    .query(({ input }) => getUnreadNotificationCount(input)),
  
  deleteNotification: publicProcedure
    .input(z.object({ notificationId: z.number(), userId: z.number() }))
    .mutation(({ input }) => deleteNotification(input.notificationId, input.userId)),

  // Gradebook routes
  getGradebookByClass: publicProcedure
    .input(z.object({ classId: z.number(), teacherId: z.number() }))
    .query(({ input }) => getGradebookByClass(input.classId, input.teacherId)),
  
  getStudentGrades: publicProcedure
    .input(z.object({ studentId: z.number(), classId: z.number().optional() }))
    .query(({ input }) => getStudentGrades(input.studentId, input.classId)),
  
  updateGradebookEntry: publicProcedure
    .input(z.object({ studentId: z.number(), assignmentId: z.number(), pointsEarned: z.number(), teacherId: z.number() }))
    .mutation(({ input }) => updateGradebookEntry(input.studentId, input.assignmentId, input.pointsEarned, input.teacherId)),
  
  excuseAssignment: publicProcedure
    .input(z.object({ studentId: z.number(), assignmentId: z.number(), teacherId: z.number() }))
    .mutation(({ input }) => excuseAssignment(input.studentId, input.assignmentId, input.teacherId)),
  
  getClassAverages: publicProcedure
    .input(z.object({ classId: z.number(), teacherId: z.number() }))
    .query(({ input }) => getClassAverages(input.classId, input.teacherId)),
  
  exportGradebook: publicProcedure
    .input(z.object({ classId: z.number(), teacherId: z.number() }))
    .query(({ input }) => exportGradebook(input.classId, input.teacherId)),

  // Calendar routes
  getCalendarEvents: publicProcedure
    .input(z.object({ userId: z.number(), startDate: z.coerce.date().optional(), endDate: z.coerce.date().optional() }))
    .query(({ input }) => getCalendarEvents(input.userId, input.startDate, input.endDate)),
  
  createCalendarEvent: publicProcedure
    .input(z.object({ classId: z.number(), title: z.string(), description: z.string(), eventDate: z.coerce.date(), eventType: z.string(), createdBy: z.number(), assignmentId: z.number().optional() }))
    .mutation(({ input }) => createCalendarEvent(input.classId, input.title, input.description, input.eventDate, input.eventType, input.createdBy, input.assignmentId)),
  
  updateCalendarEvent: publicProcedure
    .input(z.object({ eventId: z.number(), title: z.string(), description: z.string(), eventDate: z.coerce.date(), teacherId: z.number() }))
    .mutation(({ input }) => updateCalendarEvent(input.eventId, input.title, input.description, input.eventDate, input.teacherId)),
  
  deleteCalendarEvent: publicProcedure
    .input(z.object({ eventId: z.number(), userId: z.number() }))
    .mutation(({ input }) => deleteCalendarEvent(input.eventId, input.userId)),
  
  getUpcomingDeadlines: publicProcedure
    .input(z.number())
    .query(({ input }) => getUpcomingDeadlines(input)),
  
  getCalendarEventsByClass: publicProcedure
    .input(z.object({ classId: z.number(), userId: z.number() }))
    .query(({ input }) => getCalendarEventsByClass(input.classId, input.userId)),

  // Dashboard routes
  getStudentDashboard: publicProcedure
    .input(z.number())
    .query(({ input }) => getStudentDashboard(input)),
  
  getTeacherDashboard: publicProcedure
    .input(z.number())
    .query(({ input }) => getTeacherDashboard(input)),
  
  getClassStatistics: publicProcedure
    .input(z.object({ classId: z.number(), teacherId: z.number() }))
    .query(({ input }) => getClassStatistics(input.classId, input.teacherId)),
  
  getOverallStatistics: publicProcedure
    .input(z.number())
    .query(({ input }) => getOverallStatistics(input)),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();
