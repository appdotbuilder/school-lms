
import { serial, text, pgTable, timestamp, integer, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const userRoleEnum = pgEnum('user_role', ['student', 'teacher']);
export const assignmentTypeEnum = pgEnum('assignment_type', ['assignment', 'quiz', 'question']);
export const submissionStatusEnum = pgEnum('submission_status', ['pending', 'submitted', 'graded', 'returned']);
export const fileTypeEnum = pgEnum('file_type', ['document', 'image', 'video', 'audio', 'other']);
export const notificationTypeEnum = pgEnum('notification_type', ['assignment_posted', 'deadline_reminder', 'grade_received', 'comment_added', 'class_announcement']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  first_name: text('first_name').notNull(),
  last_name: text('last_name').notNull(),
  role: userRoleEnum('role').notNull(),
  profile_image_url: text('profile_image_url'),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Classes table
export const classesTable = pgTable('classes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  class_code: text('class_code').notNull().unique(),
  image_url: text('image_url'),
  teacher_id: integer('teacher_id').notNull().references(() => usersTable.id),
  is_archived: boolean('is_archived').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Class enrollments (many-to-many between users and classes)
export const classEnrollmentsTable = pgTable('class_enrollments', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  class_id: integer('class_id').notNull().references(() => classesTable.id),
  enrolled_at: timestamp('enrolled_at').defaultNow().notNull(),
});

// Assignments table
export const assignmentsTable = pgTable('assignments', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  type: assignmentTypeEnum('type').notNull(),
  class_id: integer('class_id').notNull().references(() => classesTable.id),
  teacher_id: integer('teacher_id').notNull().references(() => usersTable.id),
  due_date: timestamp('due_date'),
  publish_date: timestamp('publish_date').defaultNow().notNull(),
  max_points: integer('max_points').default(100),
  allow_late_submission: boolean('allow_late_submission').default(false).notNull(),
  is_published: boolean('is_published').default(true).notNull(),
  rubric_data: text('rubric_data'), // JSON string for rubric configuration
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Assignment submissions table
export const submissionsTable = pgTable('submissions', {
  id: serial('id').primaryKey(),
  assignment_id: integer('assignment_id').notNull().references(() => assignmentsTable.id),
  student_id: integer('student_id').notNull().references(() => usersTable.id),
  content: text('content'), // Text content or notes
  status: submissionStatusEnum('status').default('pending').notNull(),
  points_earned: integer('points_earned'),
  grade_feedback: text('grade_feedback'),
  submitted_at: timestamp('submitted_at'),
  graded_at: timestamp('graded_at'),
  graded_by: integer('graded_by').references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Quiz questions table
export const quizQuestionsTable = pgTable('quiz_questions', {
  id: serial('id').primaryKey(),
  assignment_id: integer('assignment_id').notNull().references(() => assignmentsTable.id),
  question_text: text('question_text').notNull(),
  question_type: text('question_type').notNull(), // 'multiple_choice', 'true_false', 'short_answer', 'essay'
  correct_answer: text('correct_answer'),
  answer_choices: text('answer_choices'), // JSON string for multiple choice options
  points: integer('points').default(1).notNull(),
  order_index: integer('order_index').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Quiz answers table
export const quizAnswersTable = pgTable('quiz_answers', {
  id: serial('id').primaryKey(),
  submission_id: integer('submission_id').notNull().references(() => submissionsTable.id),
  question_id: integer('question_id').notNull().references(() => quizQuestionsTable.id),
  answer_text: text('answer_text'),
  is_correct: boolean('is_correct'),
  points_earned: integer('points_earned').default(0).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Activity stream (announcements, discussions)
export const activitiesTable = pgTable('activities', {
  id: serial('id').primaryKey(),
  class_id: integer('class_id').notNull().references(() => classesTable.id),
  author_id: integer('author_id').notNull().references(() => usersTable.id),
  title: text('title'),
  content: text('content').notNull(),
  activity_type: text('activity_type').notNull(), // 'announcement', 'discussion', 'assignment_posted'
  is_pinned: boolean('is_pinned').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Comments table (for activities and assignments) - use integer for self-reference
export const commentsTable = pgTable('comments', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  author_id: integer('author_id').notNull().references(() => usersTable.id),
  activity_id: integer('activity_id').references(() => activitiesTable.id),
  assignment_id: integer('assignment_id').references(() => assignmentsTable.id),
  parent_comment_id: integer('parent_comment_id'), // Self-reference without .references() to avoid circular dependency
  is_private: boolean('is_private').default(false).notNull(),
  mentioned_users: text('mentioned_users'), // JSON array of user IDs
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Files table (internal file management)
export const filesTable = pgTable('files', {
  id: serial('id').primaryKey(),
  filename: text('filename').notNull(),
  original_filename: text('original_filename').notNull(),
  file_type: fileTypeEnum('file_type').notNull(),
  file_size: integer('file_size').notNull(), // in bytes
  mime_type: text('mime_type').notNull(),
  file_path: text('file_path').notNull(), // internal storage path
  class_id: integer('class_id').references(() => classesTable.id),
  assignment_id: integer('assignment_id').references(() => assignmentsTable.id),
  submission_id: integer('submission_id').references(() => submissionsTable.id),
  uploaded_by: integer('uploaded_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Calendar events table
export const calendarEventsTable = pgTable('calendar_events', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  class_id: integer('class_id').notNull().references(() => classesTable.id),
  assignment_id: integer('assignment_id').references(() => assignmentsTable.id),
  event_date: timestamp('event_date').notNull(),
  event_type: text('event_type').notNull(), // 'assignment_due', 'class_event', 'quiz_due'
  created_by: integer('created_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Notifications table
export const notificationsTable = pgTable('notifications', {
  id: serial('id').primaryKey(),
  user_id: integer('user_id').notNull().references(() => usersTable.id),
  title: text('title').notNull(),
  message: text('message').notNull(),
  type: notificationTypeEnum('type').notNull(),
  class_id: integer('class_id').references(() => classesTable.id),
  assignment_id: integer('assignment_id').references(() => assignmentsTable.id),
  is_read: boolean('is_read').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Gradebook entries table
export const gradebookTable = pgTable('gradebook', {
  id: serial('id').primaryKey(),
  student_id: integer('student_id').notNull().references(() => usersTable.id),
  class_id: integer('class_id').notNull().references(() => classesTable.id),
  assignment_id: integer('assignment_id').notNull().references(() => assignmentsTable.id),
  points_earned: integer('points_earned'),
  points_possible: integer('points_possible').notNull(),
  percentage: integer('percentage'), // calculated percentage
  letter_grade: text('letter_grade'),
  is_excused: boolean('is_excused').default(false).notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  teachingClasses: many(classesTable),
  enrollments: many(classEnrollmentsTable),
  assignments: many(assignmentsTable),
  submissions: many(submissionsTable),
  activities: many(activitiesTable),
  comments: many(commentsTable),
  files: many(filesTable),
  notifications: many(notificationsTable),
  gradebookEntries: many(gradebookTable),
}));

export const classesRelations = relations(classesTable, ({ one, many }) => ({
  teacher: one(usersTable, {
    fields: [classesTable.teacher_id],
    references: [usersTable.id],
  }),
  enrollments: many(classEnrollmentsTable),
  assignments: many(assignmentsTable),
  activities: many(activitiesTable),
  files: many(filesTable),
  calendarEvents: many(calendarEventsTable),
  gradebookEntries: many(gradebookTable),
}));

export const assignmentsRelations = relations(assignmentsTable, ({ one, many }) => ({
  class: one(classesTable, {
    fields: [assignmentsTable.class_id],
    references: [classesTable.id],
  }),
  teacher: one(usersTable, {
    fields: [assignmentsTable.teacher_id],
    references: [usersTable.id],
  }),
  submissions: many(submissionsTable),
  quizQuestions: many(quizQuestionsTable),
  comments: many(commentsTable),
  files: many(filesTable),
  gradebookEntries: many(gradebookTable),
}));

export const submissionsRelations = relations(submissionsTable, ({ one, many }) => ({
  assignment: one(assignmentsTable, {
    fields: [submissionsTable.assignment_id],
    references: [assignmentsTable.id],
  }),
  student: one(usersTable, {
    fields: [submissionsTable.student_id],
    references: [usersTable.id],
  }),
  quizAnswers: many(quizAnswersTable),
  files: many(filesTable),
}));

// Comments relations with self-reference
export const commentsRelations = relations(commentsTable, ({ one, many }) => ({
  author: one(usersTable, {
    fields: [commentsTable.author_id],
    references: [usersTable.id],
  }),
  activity: one(activitiesTable, {
    fields: [commentsTable.activity_id],
    references: [activitiesTable.id],
  }),
  assignment: one(assignmentsTable, {
    fields: [commentsTable.assignment_id],
    references: [assignmentsTable.id],
  }),
  parentComment: one(commentsTable, {
    fields: [commentsTable.parent_comment_id],
    references: [commentsTable.id],
    relationName: 'comment_replies',
  }),
  replies: many(commentsTable, {
    relationName: 'comment_replies',
  }),
}));

export const activitiesRelations = relations(activitiesTable, ({ one, many }) => ({
  class: one(classesTable, {
    fields: [activitiesTable.class_id],
    references: [classesTable.id],
  }),
  author: one(usersTable, {
    fields: [activitiesTable.author_id],
    references: [usersTable.id],
  }),
  comments: many(commentsTable),
}));

export const filesRelations = relations(filesTable, ({ one }) => ({
  uploader: one(usersTable, {
    fields: [filesTable.uploaded_by],
    references: [usersTable.id],
  }),
  class: one(classesTable, {
    fields: [filesTable.class_id],
    references: [classesTable.id],
  }),
  assignment: one(assignmentsTable, {
    fields: [filesTable.assignment_id],
    references: [assignmentsTable.id],
  }),
  submission: one(submissionsTable, {
    fields: [filesTable.submission_id],
    references: [submissionsTable.id],
  }),
}));

export const classEnrollmentsRelations = relations(classEnrollmentsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [classEnrollmentsTable.user_id],
    references: [usersTable.id],
  }),
  class: one(classesTable, {
    fields: [classEnrollmentsTable.class_id],
    references: [classesTable.id],
  }),
}));

export const quizQuestionsRelations = relations(quizQuestionsTable, ({ one, many }) => ({
  assignment: one(assignmentsTable, {
    fields: [quizQuestionsTable.assignment_id],
    references: [assignmentsTable.id],
  }),
  answers: many(quizAnswersTable),
}));

export const quizAnswersRelations = relations(quizAnswersTable, ({ one }) => ({
  submission: one(submissionsTable, {
    fields: [quizAnswersTable.submission_id],
    references: [submissionsTable.id],
  }),
  question: one(quizQuestionsTable, {
    fields: [quizAnswersTable.question_id],
    references: [quizQuestionsTable.id],
  }),
}));

export const calendarEventsRelations = relations(calendarEventsTable, ({ one }) => ({
  class: one(classesTable, {
    fields: [calendarEventsTable.class_id],
    references: [classesTable.id],
  }),
  assignment: one(assignmentsTable, {
    fields: [calendarEventsTable.assignment_id],
    references: [assignmentsTable.id],
  }),
  creator: one(usersTable, {
    fields: [calendarEventsTable.created_by],
    references: [usersTable.id],
  }),
}));

export const notificationsRelations = relations(notificationsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [notificationsTable.user_id],
    references: [usersTable.id],
  }),
  class: one(classesTable, {
    fields: [notificationsTable.class_id],
    references: [classesTable.id],
  }),
  assignment: one(assignmentsTable, {
    fields: [notificationsTable.assignment_id],
    references: [assignmentsTable.id],
  }),
}));

export const gradebookRelations = relations(gradebookTable, ({ one }) => ({
  student: one(usersTable, {
    fields: [gradebookTable.student_id],
    references: [usersTable.id],
  }),
  class: one(classesTable, {
    fields: [gradebookTable.class_id],
    references: [classesTable.id],
  }),
  assignment: one(assignmentsTable, {
    fields: [gradebookTable.assignment_id],
    references: [assignmentsTable.id],
  }),
}));

// Export all tables for relation queries
export const tables = {
  users: usersTable,
  classes: classesTable,
  classEnrollments: classEnrollmentsTable,
  assignments: assignmentsTable,
  submissions: submissionsTable,
  quizQuestions: quizQuestionsTable,
  quizAnswers: quizAnswersTable,
  activities: activitiesTable,
  comments: commentsTable,
  files: filesTable,
  calendarEvents: calendarEventsTable,
  notifications: notificationsTable,
  gradebook: gradebookTable,
};
