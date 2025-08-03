
import { z } from 'zod';

// Enums
export const userRoleSchema = z.enum(['student', 'teacher']);
export const assignmentTypeSchema = z.enum(['assignment', 'quiz', 'question']);
export const submissionStatusSchema = z.enum(['pending', 'submitted', 'graded', 'returned']);
export const fileTypeSchema = z.enum(['document', 'image', 'video', 'audio', 'other']);
export const notificationTypeSchema = z.enum(['assignment_posted', 'deadline_reminder', 'grade_received', 'comment_added', 'class_announcement']);

// User schemas
export const userSchema = z.object({
  id: z.number(),
  email: z.string().email(),
  password_hash: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: userRoleSchema,
  profile_image_url: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type User = z.infer<typeof userSchema>;

export const createUserInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  role: userRoleSchema,
  profile_image_url: z.string().nullable().optional(),
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// Class schemas
export const classSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  class_code: z.string(),
  image_url: z.string().nullable(),
  teacher_id: z.number(),
  is_archived: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Class = z.infer<typeof classSchema>;

export const createClassInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
});

export type CreateClassInput = z.infer<typeof createClassInputSchema>;

export const joinClassInputSchema = z.object({
  class_code: z.string(),
});

export type JoinClassInput = z.infer<typeof joinClassInputSchema>;

// Assignment schemas
export const assignmentSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  type: assignmentTypeSchema,
  class_id: z.number(),
  teacher_id: z.number(),
  due_date: z.coerce.date().nullable(),
  publish_date: z.coerce.date(),
  max_points: z.number().nullable(),
  allow_late_submission: z.boolean(),
  is_published: z.boolean(),
  rubric_data: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Assignment = z.infer<typeof assignmentSchema>;

export const createAssignmentInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  type: assignmentTypeSchema,
  class_id: z.number(),
  due_date: z.coerce.date().nullable().optional(),
  publish_date: z.coerce.date().optional(),
  max_points: z.number().positive().optional(),
  allow_late_submission: z.boolean().optional(),
  is_published: z.boolean().optional(),
  rubric_data: z.string().nullable().optional(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentInputSchema>;

// Submission schemas
export const submissionSchema = z.object({
  id: z.number(),
  assignment_id: z.number(),
  student_id: z.number(),
  content: z.string().nullable(),
  status: submissionStatusSchema,
  points_earned: z.number().nullable(),
  grade_feedback: z.string().nullable(),
  submitted_at: z.coerce.date().nullable(),
  graded_at: z.coerce.date().nullable(),
  graded_by: z.number().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Submission = z.infer<typeof submissionSchema>;

export const createSubmissionInputSchema = z.object({
  assignment_id: z.number(),
  content: z.string().nullable().optional(),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionInputSchema>;

export const gradeSubmissionInputSchema = z.object({
  submission_id: z.number(),
  points_earned: z.number().nonnegative(),
  grade_feedback: z.string().nullable().optional(),
});

export type GradeSubmissionInput = z.infer<typeof gradeSubmissionInputSchema>;

// Quiz schemas
export const quizQuestionSchema = z.object({
  id: z.number(),
  assignment_id: z.number(),
  question_text: z.string(),
  question_type: z.string(),
  correct_answer: z.string().nullable(),
  answer_choices: z.string().nullable(),
  points: z.number(),
  order_index: z.number(),
  created_at: z.coerce.date(),
});

export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

export const createQuizQuestionInputSchema = z.object({
  assignment_id: z.number(),
  question_text: z.string().min(1),
  question_type: z.enum(['multiple_choice', 'true_false', 'short_answer', 'essay']),
  correct_answer: z.string().nullable().optional(),
  answer_choices: z.string().nullable().optional(),
  points: z.number().positive().optional(),
  order_index: z.number(),
});

export type CreateQuizQuestionInput = z.infer<typeof createQuizQuestionInputSchema>;

// Activity schemas
export const activitySchema = z.object({
  id: z.number(),
  class_id: z.number(),
  author_id: z.number(),
  title: z.string().nullable(),
  content: z.string(),
  activity_type: z.string(),
  is_pinned: z.boolean(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Activity = z.infer<typeof activitySchema>;

export const createActivityInputSchema = z.object({
  class_id: z.number(),
  title: z.string().nullable().optional(),
  content: z.string().min(1),
  activity_type: z.enum(['announcement', 'discussion', 'assignment_posted']),
  is_pinned: z.boolean().optional(),
});

export type CreateActivityInput = z.infer<typeof createActivityInputSchema>;

// Comment schemas
export const commentSchema = z.object({
  id: z.number(),
  content: z.string(),
  author_id: z.number(),
  activity_id: z.number().nullable(),
  assignment_id: z.number().nullable(),
  parent_comment_id: z.number().nullable(),
  is_private: z.boolean(),
  mentioned_users: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});

export type Comment = z.infer<typeof commentSchema>;

export const createCommentInputSchema = z.object({
  content: z.string().min(1),
  activity_id: z.number().nullable().optional(),
  assignment_id: z.number().nullable().optional(),
  parent_comment_id: z.number().nullable().optional(),
  is_private: z.boolean().optional(),
  mentioned_users: z.array(z.number()).optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentInputSchema>;

// File schemas
export const fileSchema = z.object({
  id: z.number(),
  filename: z.string(),
  original_filename: z.string(),
  file_type: fileTypeSchema,
  file_size: z.number(),
  mime_type: z.string(),
  file_path: z.string(),
  class_id: z.number().nullable(),
  assignment_id: z.number().nullable(),
  submission_id: z.number().nullable(),
  uploaded_by: z.number(),
  created_at: z.coerce.date(),
});

export type File = z.infer<typeof fileSchema>;

export const uploadFileInputSchema = z.object({
  filename: z.string(),
  original_filename: z.string(),
  file_type: fileTypeSchema,
  file_size: z.number().positive(),
  mime_type: z.string(),
  class_id: z.number().nullable().optional(),
  assignment_id: z.number().nullable().optional(),
  submission_id: z.number().nullable().optional(),
});

export type UploadFileInput = z.infer<typeof uploadFileInputSchema>;

// Notification schemas
export const notificationSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  title: z.string(),
  message: z.string(),
  type: notificationTypeSchema,
  class_id: z.number().nullable(),
  assignment_id: z.number().nullable(),
  is_read: z.boolean(),
  created_at: z.coerce.date(),
});

export type Notification = z.infer<typeof notificationSchema>;

// Gradebook schemas
export const gradebookEntrySchema = z.object({
  id: z.number(),
  student_id: z.number(),
  class_id: z.number(),
  assignment_id: z.number(),
  points_earned: z.number().nullable(),
  points_possible: z.number(),
  percentage: z.number().nullable(),
  letter_grade: z.string().nullable(),
  is_excused: z.boolean(),
  updated_at: z.coerce.date(),
});

export type GradebookEntry = z.infer<typeof gradebookEntrySchema>;

// Calendar event schemas
export const calendarEventSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  class_id: z.number(),
  assignment_id: z.number().nullable(),
  event_date: z.coerce.date(),
  event_type: z.string(),
  created_by: z.number(),
  created_at: z.coerce.date(),
});

export type CalendarEvent = z.infer<typeof calendarEventSchema>;

// Dashboard data schemas
export const studentDashboardSchema = z.object({
  upcomingAssignments: z.array(assignmentSchema),
  recentGrades: z.array(gradebookEntrySchema),
  recentActivities: z.array(activitySchema),
  notifications: z.array(notificationSchema),
  calendarEvents: z.array(calendarEventSchema),
});

export type StudentDashboard = z.infer<typeof studentDashboardSchema>;

export const teacherDashboardSchema = z.object({
  recentAssignments: z.array(assignmentSchema),
  pendingSubmissions: z.array(submissionSchema),
  recentActivities: z.array(activitySchema),
  upcomingDeadlines: z.array(assignmentSchema),
  classStats: z.object({
    totalClasses: z.number(),
    totalStudents: z.number(),
    pendingGrades: z.number(),
  }),
});

export type TeacherDashboard = z.infer<typeof teacherDashboardSchema>;
