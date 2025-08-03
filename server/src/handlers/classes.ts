
import { db } from '../db';
import { classesTable, classEnrollmentsTable, usersTable } from '../db/schema';
import { type CreateClassInput, type JoinClassInput, type Class } from '../schema';
import { eq, and } from 'drizzle-orm';

// Generate a unique 6-character class code
function generateClassCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function createClass(input: CreateClassInput, teacherId: number): Promise<Class> {
  try {
    // Generate a unique class code
    let classCode: string;
    let isUnique = false;
    
    do {
      classCode = generateClassCode();
      const existing = await db.select()
        .from(classesTable)
        .where(eq(classesTable.class_code, classCode))
        .execute();
      isUnique = existing.length === 0;
    } while (!isUnique);

    // Create the class
    const result = await db.insert(classesTable)
      .values({
        name: input.name,
        description: input.description || null,
        class_code: classCode,
        image_url: input.image_url || null,
        teacher_id: teacherId,
        is_archived: false
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Class creation failed:', error);
    throw error;
  }
}

export async function getClassesByUser(userId: number, role: 'student' | 'teacher'): Promise<Class[]> {
  try {
    if (role === 'teacher') {
      // Get classes where user is the teacher
      const classes = await db.select()
        .from(classesTable)
        .where(eq(classesTable.teacher_id, userId))
        .execute();
      
      return classes;
    } else {
      // Get classes where user is enrolled as student
      const results = await db.select()
        .from(classesTable)
        .innerJoin(classEnrollmentsTable, eq(classesTable.id, classEnrollmentsTable.class_id))
        .where(eq(classEnrollmentsTable.user_id, userId))
        .execute();

      return results.map(result => result.classes);
    }
  } catch (error) {
    console.error('Failed to get classes by user:', error);
    throw error;
  }
}

export async function getClassById(classId: number, userId: number): Promise<Class> {
  try {
    // First get the class
    const classes = await db.select()
      .from(classesTable)
      .where(eq(classesTable.id, classId))
      .execute();

    if (classes.length === 0) {
      throw new Error('Class not found');
    }

    const classData = classes[0];

    // Check if user has access (either teacher or enrolled student)
    const isTeacher = classData.teacher_id === userId;
    
    let isEnrolled = false;
    if (!isTeacher) {
      const enrollments = await db.select()
        .from(classEnrollmentsTable)
        .where(and(
          eq(classEnrollmentsTable.class_id, classId),
          eq(classEnrollmentsTable.user_id, userId)
        ))
        .execute();
      
      isEnrolled = enrollments.length > 0;
    }

    if (!isTeacher && !isEnrolled) {
      throw new Error('Access denied');
    }

    return classData;
  } catch (error) {
    console.error('Failed to get class by ID:', error);
    throw error;
  }
}

export async function joinClass(input: JoinClassInput, studentId: number): Promise<Class> {
  try {
    // Find class by code
    const classes = await db.select()
      .from(classesTable)
      .where(eq(classesTable.class_code, input.class_code))
      .execute();

    if (classes.length === 0) {
      throw new Error('Class not found');
    }

    const classData = classes[0];

    // Check if already enrolled
    const existingEnrollment = await db.select()
      .from(classEnrollmentsTable)
      .where(and(
        eq(classEnrollmentsTable.class_id, classData.id),
        eq(classEnrollmentsTable.user_id, studentId)
      ))
      .execute();

    if (existingEnrollment.length > 0) {
      throw new Error('Already enrolled in class');
    }

    // Create enrollment
    await db.insert(classEnrollmentsTable)
      .values({
        user_id: studentId,
        class_id: classData.id
      })
      .execute();

    return classData;
  } catch (error) {
    console.error('Failed to join class:', error);
    throw error;
  }
}

export async function archiveClass(classId: number, teacherId: number): Promise<Class> {
  try {
    // Update class to archived, but only if user is the teacher
    const result = await db.update(classesTable)
      .set({ 
        is_archived: true,
        updated_at: new Date()
      })
      .where(and(
        eq(classesTable.id, classId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Class not found or access denied');
    }

    return result[0];
  } catch (error) {
    console.error('Failed to archive class:', error);
    throw error;
  }
}

export async function getClassStudents(classId: number, teacherId: number): Promise<any[]> {
  try {
    // First verify teacher has access to this class
    const classes = await db.select()
      .from(classesTable)
      .where(and(
        eq(classesTable.id, classId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (classes.length === 0) {
      throw new Error('Class not found or access denied');
    }

    // Get all students enrolled in the class
    const results = await db.select({
      id: usersTable.id,
      email: usersTable.email,
      first_name: usersTable.first_name,
      last_name: usersTable.last_name,
      profile_image_url: usersTable.profile_image_url,
      enrolled_at: classEnrollmentsTable.enrolled_at
    })
    .from(usersTable)
    .innerJoin(classEnrollmentsTable, eq(usersTable.id, classEnrollmentsTable.user_id))
    .where(eq(classEnrollmentsTable.class_id, classId))
    .execute();

    return results;
  } catch (error) {
    console.error('Failed to get class students:', error);
    throw error;
  }
}
