
import { db } from '../db';
import { filesTable, classesTable, assignmentsTable, submissionsTable, classEnrollmentsTable, usersTable } from '../db/schema';
import { type UploadFileInput, type File } from '../schema';
import { eq, and, or } from 'drizzle-orm';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Ensure uploads directory exists
const UPLOADS_DIR = join(process.cwd(), 'uploads');
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function uploadFile(input: UploadFileInput, uploadedBy: number, fileBuffer: Buffer): Promise<File> {
  try {
    // Validate file associations if provided
    if (input.class_id) {
      const classExists = await db.select()
        .from(classesTable)
        .where(eq(classesTable.id, input.class_id))
        .limit(1)
        .execute();
      
      if (classExists.length === 0) {
        throw new Error('Class not found');
      }
    }

    if (input.assignment_id) {
      const assignmentExists = await db.select()
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, input.assignment_id))
        .limit(1)
        .execute();
      
      if (assignmentExists.length === 0) {
        throw new Error('Assignment not found');
      }
    }

    if (input.submission_id) {
      const submissionExists = await db.select()
        .from(submissionsTable)
        .where(eq(submissionsTable.id, input.submission_id))
        .limit(1)
        .execute();
      
      if (submissionExists.length === 0) {
        throw new Error('Submission not found');
      }
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}_${input.filename}`;
    const filePath = join(UPLOADS_DIR, uniqueFilename);

    // Write file to disk
    writeFileSync(filePath, fileBuffer);

    // Insert file record into database
    const result = await db.insert(filesTable)
      .values({
        filename: uniqueFilename,
        original_filename: input.original_filename,
        file_type: input.file_type,
        file_size: input.file_size,
        mime_type: input.mime_type,
        file_path: filePath,
        class_id: input.class_id || null,
        assignment_id: input.assignment_id || null,
        submission_id: input.submission_id || null,
        uploaded_by: uploadedBy
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('File upload failed:', error);
    throw error;
  }
}

export async function getFilesByClass(classId: number, userId: number): Promise<File[]> {
  try {
    // Verify user has access to the class (is teacher or enrolled student)
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
      .limit(1)
      .execute();

    if (classAccess.length === 0) {
      throw new Error('Access denied to class files');
    }

    // Get all files for the class
    const files = await db.select()
      .from(filesTable)
      .where(eq(filesTable.class_id, classId))
      .execute();

    return files;
  } catch (error) {
    console.error('Get files by class failed:', error);
    throw error;
  }
}

export async function getFilesByAssignment(assignmentId: number, userId: number): Promise<File[]> {
  try {
    // Verify user has access to the assignment (through class enrollment or being teacher)
    const assignmentAccess = await db.select()
      .from(assignmentsTable)
      .innerJoin(classesTable, eq(assignmentsTable.class_id, classesTable.id))
      .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.class_id, classesTable.id))
      .where(
        and(
          eq(assignmentsTable.id, assignmentId),
          or(
            eq(classesTable.teacher_id, userId),
            eq(classEnrollmentsTable.user_id, userId)
          )
        )
      )
      .limit(1)
      .execute();

    if (assignmentAccess.length === 0) {
      throw new Error('Access denied to assignment files');
    }

    // Get all files for the assignment
    const files = await db.select()
      .from(filesTable)
      .where(eq(filesTable.assignment_id, assignmentId))
      .execute();

    return files;
  } catch (error) {
    console.error('Get files by assignment failed:', error);
    throw error;
  }
}

export async function downloadFile(fileId: number, userId: number): Promise<{ file: File; buffer: Buffer }> {
  try {
    // Get file metadata
    const fileResult = await db.select()
      .from(filesTable)
      .where(eq(filesTable.id, fileId))
      .limit(1)
      .execute();

    if (fileResult.length === 0) {
      throw new Error('File not found');
    }

    const file = fileResult[0];

    // Check access permissions
    let hasAccess = false;

    // File uploader always has access
    if (file.uploaded_by === userId) {
      hasAccess = true;
    }

    // Check class access if file is associated with a class
    if (!hasAccess && file.class_id) {
      const classAccess = await db.select()
        .from(classesTable)
        .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.class_id, classesTable.id))
        .where(
          and(
            eq(classesTable.id, file.class_id),
            or(
              eq(classesTable.teacher_id, userId),
              eq(classEnrollmentsTable.user_id, userId)
            )
          )
        )
        .limit(1)
        .execute();

      hasAccess = classAccess.length > 0;
    }

    if (!hasAccess) {
      throw new Error('Access denied to file');
    }

    // Read file from disk
    if (!existsSync(file.file_path)) {
      throw new Error('File not found on disk');
    }

    const buffer = readFileSync(file.file_path);

    return { file, buffer };
  } catch (error) {
    console.error('File download failed:', error);
    throw error;
  }
}

export async function deleteFile(fileId: number, userId: number): Promise<void> {
  try {
    // Get file metadata
    const fileResult = await db.select()
      .from(filesTable)
      .where(eq(filesTable.id, fileId))
      .limit(1)
      .execute();

    if (fileResult.length === 0) {
      throw new Error('File not found');
    }

    const file = fileResult[0];

    // Check if user can delete the file (uploader or class teacher)
    let canDelete = false;

    // File uploader can delete
    if (file.uploaded_by === userId) {
      canDelete = true;
    }

    // Class teacher can delete class files
    if (!canDelete && file.class_id) {
      const classCheck = await db.select()
        .from(classesTable)
        .where(
          and(
            eq(classesTable.id, file.class_id),
            eq(classesTable.teacher_id, userId)
          )
        )
        .limit(1)
        .execute();

      canDelete = classCheck.length > 0;
    }

    if (!canDelete) {
      throw new Error('Permission denied to delete file');
    }

    // Delete file from database
    await db.delete(filesTable)
      .where(eq(filesTable.id, fileId))
      .execute();

    // Delete file from disk if it exists
    if (existsSync(file.file_path)) {
      unlinkSync(file.file_path);
    }
  } catch (error) {
    console.error('File deletion failed:', error);
    throw error;
  }
}

export async function getFileById(fileId: number, userId: number): Promise<File> {
  try {
    // Get file metadata
    const fileResult = await db.select()
      .from(filesTable)
      .where(eq(filesTable.id, fileId))
      .limit(1)
      .execute();

    if (fileResult.length === 0) {
      throw new Error('File not found');
    }

    const file = fileResult[0];

    // Check access permissions
    let hasAccess = false;

    // File uploader always has access
    if (file.uploaded_by === userId) {
      hasAccess = true;
    }

    // Check class access if file is associated with a class
    if (!hasAccess && file.class_id) {
      const classAccess = await db.select()
        .from(classesTable)
        .leftJoin(classEnrollmentsTable, eq(classEnrollmentsTable.class_id, classesTable.id))
        .where(
          and(
            eq(classesTable.id, file.class_id),
            or(
              eq(classesTable.teacher_id, userId),
              eq(classEnrollmentsTable.user_id, userId)
            )
          )
        )
        .limit(1)
        .execute();

      hasAccess = classAccess.length > 0;
    }

    if (!hasAccess) {
      throw new Error('Access denied to file');
    }

    return file;
  } catch (error) {
    console.error('Get file by ID failed:', error);
    throw error;
  }
}
