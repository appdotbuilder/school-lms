
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, classesTable, assignmentsTable, submissionsTable, classEnrollmentsTable, filesTable } from '../db/schema';
import { type UploadFileInput } from '../schema';
import { uploadFile, getFilesByClass, getFilesByAssignment, downloadFile, deleteFile, getFileById } from '../handlers/files';
import { eq } from 'drizzle-orm';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

// Test data
const testFileInput: UploadFileInput = {
  filename: 'test_document.pdf',
  original_filename: 'Test Document.pdf',
  file_type: 'document',
  file_size: 1024,
  mime_type: 'application/pdf',
  class_id: null,
  assignment_id: null,
  submission_id: null
};

const testFileBuffer = Buffer.from('test file content');

describe('File Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('uploadFile', () => {
    it('should upload a file successfully', async () => {
      // Create a user
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'Test',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const result = await uploadFile(testFileInput, userId, testFileBuffer);

      expect(result.id).toBeDefined();
      expect(result.original_filename).toEqual('Test Document.pdf');
      expect(result.file_type).toEqual('document');
      expect(result.file_size).toEqual(1024);
      expect(result.mime_type).toEqual('application/pdf');
      expect(result.uploaded_by).toEqual(userId);
      expect(result.filename).toMatch(/^\d+_test_document\.pdf$/);
      expect(result.file_path).toContain(UPLOADS_DIR);
      expect(result.created_at).toBeInstanceOf(Date);

      // Verify file was written to disk
      expect(existsSync(result.file_path)).toBe(true);

      // Clean up
      if (existsSync(result.file_path)) {
        unlinkSync(result.file_path);
      }
    });

    it('should upload file with class association', async () => {
      // Create test data
      const userResult = await db.insert(usersTable)
        .values({
          email: 'teacher@example.com',
          password_hash: 'hashed_password',
          first_name: 'Teacher',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();

      const teacherId = userResult[0].id;

      const classResult = await db.insert(classesTable)
        .values({
          name: 'Test Class',
          class_code: 'TEST123',
          teacher_id: teacherId
        })
        .returning()
        .execute();

      const classId = classResult[0].id;

      const fileInput: UploadFileInput = {
        ...testFileInput,
        class_id: classId
      };

      const result = await uploadFile(fileInput, teacherId, testFileBuffer);

      expect(result.class_id).toEqual(classId);
      expect(result.assignment_id).toBeNull();
      expect(result.submission_id).toBeNull();

      // Clean up
      if (existsSync(result.file_path)) {
        unlinkSync(result.file_path);
      }
    });

    it('should throw error for non-existent class', async () => {
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'Test',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const fileInput: UploadFileInput = {
        ...testFileInput,
        class_id: 999
      };

      await expect(uploadFile(fileInput, userId, testFileBuffer)).rejects.toThrow(/class not found/i);
    });
  });

  describe('getFilesByClass', () => {
    it('should return files for class teacher', async () => {
      // Create teacher and class
      const teacherResult = await db.insert(usersTable)
        .values({
          email: 'teacher@example.com',
          password_hash: 'hashed_password',
          first_name: 'Teacher',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();

      const teacherId = teacherResult[0].id;

      const classResult = await db.insert(classesTable)
        .values({
          name: 'Test Class',
          class_code: 'TEST123',
          teacher_id: teacherId
        })
        .returning()
        .execute();

      const classId = classResult[0].id;

      // Upload file to class
      const fileInput: UploadFileInput = {
        ...testFileInput,
        class_id: classId
      };

      const uploadedFile = await uploadFile(fileInput, teacherId, testFileBuffer);

      // Get files by class
      const files = await getFilesByClass(classId, teacherId);

      expect(files).toHaveLength(1);
      expect(files[0].id).toEqual(uploadedFile.id);
      expect(files[0].class_id).toEqual(classId);

      // Clean up
      if (existsSync(uploadedFile.file_path)) {
        unlinkSync(uploadedFile.file_path);
      }
    });

    it('should return files for enrolled student', async () => {
      // Create teacher, student, and class
      const teacherResult = await db.insert(usersTable)
        .values({
          email: 'teacher@example.com',
          password_hash: 'hashed_password',
          first_name: 'Teacher',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();

      const studentResult = await db.insert(usersTable)
        .values({
          email: 'student@example.com',
          password_hash: 'hashed_password',
          first_name: 'Student',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const teacherId = teacherResult[0].id;
      const studentId = studentResult[0].id;

      const classResult = await db.insert(classesTable)
        .values({
          name: 'Test Class',
          class_code: 'TEST123',
          teacher_id: teacherId
        })
        .returning()
        .execute();

      const classId = classResult[0].id;

      // Enroll student in class
      await db.insert(classEnrollmentsTable)
        .values({
          user_id: studentId,
          class_id: classId
        })
        .execute();

      // Upload file to class
      const fileInput: UploadFileInput = {
        ...testFileInput,
        class_id: classId
      };

      const uploadedFile = await uploadFile(fileInput, teacherId, testFileBuffer);

      // Student should be able to access class files
      const files = await getFilesByClass(classId, studentId);

      expect(files).toHaveLength(1);
      expect(files[0].id).toEqual(uploadedFile.id);

      // Clean up
      if (existsSync(uploadedFile.file_path)) {
        unlinkSync(uploadedFile.file_path);
      }
    });

    it('should throw error for unauthorized user', async () => {
      // Create teacher and unauthorized user
      const teacherResult = await db.insert(usersTable)
        .values({
          email: 'teacher@example.com',
          password_hash: 'hashed_password',
          first_name: 'Teacher',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();

      const unauthorizedResult = await db.insert(usersTable)
        .values({
          email: 'unauthorized@example.com',
          password_hash: 'hashed_password',
          first_name: 'Unauthorized',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const teacherId = teacherResult[0].id;
      const unauthorizedId = unauthorizedResult[0].id;

      const classResult = await db.insert(classesTable)
        .values({
          name: 'Test Class',
          class_code: 'TEST123',
          teacher_id: teacherId
        })
        .returning()
        .execute();

      const classId = classResult[0].id;

      await expect(getFilesByClass(classId, unauthorizedId)).rejects.toThrow(/access denied/i);
    });
  });

  describe('downloadFile', () => {
    it('should allow file uploader to download', async () => {
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'Test',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const uploadedFile = await uploadFile(testFileInput, userId, testFileBuffer);

      const { file, buffer } = await downloadFile(uploadedFile.id, userId);

      expect(file.id).toEqual(uploadedFile.id);
      expect(buffer.toString()).toEqual('test file content');

      // Clean up
      if (existsSync(uploadedFile.file_path)) {
        unlinkSync(uploadedFile.file_path);
      }
    });

    it('should throw error for non-existent file', async () => {
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'Test',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      await expect(downloadFile(999, userId)).rejects.toThrow(/file not found/i);
    });
  });

  describe('deleteFile', () => {
    it('should allow uploader to delete file', async () => {
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'Test',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const uploadedFile = await uploadFile(testFileInput, userId, testFileBuffer);

      await deleteFile(uploadedFile.id, userId);

      // Verify file is deleted from database
      const files = await db.select()
        .from(filesTable)
        .where(eq(filesTable.id, uploadedFile.id))
        .execute();

      expect(files).toHaveLength(0);

      // Verify file is deleted from disk
      expect(existsSync(uploadedFile.file_path)).toBe(false);
    });

    it('should allow class teacher to delete class files', async () => {
      // Create teacher and student
      const teacherResult = await db.insert(usersTable)
        .values({
          email: 'teacher@example.com',
          password_hash: 'hashed_password',
          first_name: 'Teacher',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();

      const studentResult = await db.insert(usersTable)
        .values({
          email: 'student@example.com',
          password_hash: 'hashed_password',
          first_name: 'Student',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const teacherId = teacherResult[0].id;
      const studentId = studentResult[0].id;

      const classResult = await db.insert(classesTable)
        .values({
          name: 'Test Class',
          class_code: 'TEST123',
          teacher_id: teacherId
        })
        .returning()
        .execute();

      const classId = classResult[0].id;

      // Student uploads file to class
      const fileInput: UploadFileInput = {
        ...testFileInput,
        class_id: classId
      };

      const uploadedFile = await uploadFile(fileInput, studentId, testFileBuffer);

      // Teacher should be able to delete
      await deleteFile(uploadedFile.id, teacherId);

      // Verify deletion
      const files = await db.select()
        .from(filesTable)
        .where(eq(filesTable.id, uploadedFile.id))
        .execute();

      expect(files).toHaveLength(0);
    });

    it('should throw error for unauthorized deletion', async () => {
      const user1Result = await db.insert(usersTable)
        .values({
          email: 'user1@example.com',
          password_hash: 'hashed_password',
          first_name: 'User1',
          last_name: 'Test',
          role: 'student'
        })
        .returning()
        .execute();

      const user2Result = await db.insert(usersTable)
        .values({
          email: 'user2@example.com',
          password_hash: 'hashed_password',
          first_name: 'User2',
          last_name: 'Test',
          role: 'student'
        })
        .returning()
        .execute();

      const user1Id = user1Result[0].id;
      const user2Id = user2Result[0].id;

      const uploadedFile = await uploadFile(testFileInput, user1Id, testFileBuffer);

      await expect(deleteFile(uploadedFile.id, user2Id)).rejects.toThrow(/permission denied/i);

      // Clean up
      if (existsSync(uploadedFile.file_path)) {
        unlinkSync(uploadedFile.file_path);
      }
    });
  });

  describe('getFileById', () => {
    it('should return file for authorized user', async () => {
      const userResult = await db.insert(usersTable)
        .values({
          email: 'test@example.com',
          password_hash: 'hashed_password',
          first_name: 'Test',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const userId = userResult[0].id;

      const uploadedFile = await uploadFile(testFileInput, userId, testFileBuffer);

      const file = await getFileById(uploadedFile.id, userId);

      expect(file.id).toEqual(uploadedFile.id);
      expect(file.original_filename).toEqual('Test Document.pdf');
      expect(file.uploaded_by).toEqual(userId);

      // Clean up
      if (existsSync(uploadedFile.file_path)) {
        unlinkSync(uploadedFile.file_path);
      }
    });

    it('should throw error for unauthorized access', async () => {
      const user1Result = await db.insert(usersTable)
        .values({
          email: 'user1@example.com',
          password_hash: 'hashed_password',
          first_name: 'User1',
          last_name: 'Test',
          role: 'student'
        })
        .returning()
        .execute();

      const user2Result = await db.insert(usersTable)
        .values({
          email: 'user2@example.com',
          password_hash: 'hashed_password',
          first_name: 'User2',
          last_name: 'Test',
          role: 'student'
        })
        .returning()
        .execute();

      const user1Id = user1Result[0].id;
      const user2Id = user2Result[0].id;

      const uploadedFile = await uploadFile(testFileInput, user1Id, testFileBuffer);

      await expect(getFileById(uploadedFile.id, user2Id)).rejects.toThrow(/access denied/i);

      // Clean up
      if (existsSync(uploadedFile.file_path)) {
        unlinkSync(uploadedFile.file_path);
      }
    });
  });

  describe('getFilesByAssignment', () => {
    it('should return assignment files for class teacher', async () => {
      // Create teacher and assignment
      const teacherResult = await db.insert(usersTable)
        .values({
          email: 'teacher@example.com',
          password_hash: 'hashed_password',
          first_name: 'Teacher',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();

      const teacherId = teacherResult[0].id;

      const classResult = await db.insert(classesTable)
        .values({
          name: 'Test Class',
          class_code: 'TEST123',
          teacher_id: teacherId
        })
        .returning()
        .execute();

      const classId = classResult[0].id;

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Test Assignment',
          type: 'assignment',
          class_id: classId,
          teacher_id: teacherId
        })
        .returning()
        .execute();

      const assignmentId = assignmentResult[0].id;

      // Upload file to assignment
      const fileInput: UploadFileInput = {
        ...testFileInput,
        assignment_id: assignmentId
      };

      const uploadedFile = await uploadFile(fileInput, teacherId, testFileBuffer);

      const files = await getFilesByAssignment(assignmentId, teacherId);

      expect(files).toHaveLength(1);
      expect(files[0].id).toEqual(uploadedFile.id);
      expect(files[0].assignment_id).toEqual(assignmentId);

      // Clean up
      if (existsSync(uploadedFile.file_path)) {
        unlinkSync(uploadedFile.file_path);
      }
    });

    it('should throw error for unauthorized assignment access', async () => {
      const teacherResult = await db.insert(usersTable)
        .values({
          email: 'teacher@example.com',
          password_hash: 'hashed_password',
          first_name: 'Teacher',
          last_name: 'User',
          role: 'teacher'
        })
        .returning()
        .execute();

      const unauthorizedResult = await db.insert(usersTable)
        .values({
          email: 'unauthorized@example.com',
          password_hash: 'hashed_password',
          first_name: 'Unauthorized',
          last_name: 'User',
          role: 'student'
        })
        .returning()
        .execute();

      const teacherId = teacherResult[0].id;
      const unauthorizedId = unauthorizedResult[0].id;

      const classResult = await db.insert(classesTable)
        .values({
          name: 'Test Class',
          class_code: 'TEST123',
          teacher_id: teacherId
        })
        .returning()
        .execute();

      const classId = classResult[0].id;

      const assignmentResult = await db.insert(assignmentsTable)
        .values({
          title: 'Test Assignment',
          type: 'assignment',
          class_id: classId,
          teacher_id: teacherId
        })
        .returning()
        .execute();

      const assignmentId = assignmentResult[0].id;

      await expect(getFilesByAssignment(assignmentId, unauthorizedId)).rejects.toThrow(/access denied/i);
    });
  });
});
