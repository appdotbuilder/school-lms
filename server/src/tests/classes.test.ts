
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, classesTable, classEnrollmentsTable } from '../db/schema';
import { type CreateClassInput, type JoinClassInput } from '../schema';
import { 
  createClass, 
  getClassesByUser, 
  getClassById, 
  joinClass, 
  archiveClass, 
  getClassStudents 
} from '../handlers/classes';
import { eq, and } from 'drizzle-orm';

// Test data
const testTeacher = {
  email: 'teacher@test.com',
  password_hash: 'hashed_password',
  first_name: 'John',
  last_name: 'Teacher',
  role: 'teacher' as const,
  is_active: true
};

const testStudent = {
  email: 'student@test.com',
  password_hash: 'hashed_password',
  first_name: 'Jane',
  last_name: 'Student',
  role: 'student' as const,
  is_active: true
};

const testClassInput: CreateClassInput = {
  name: 'Test Math Class',
  description: 'A test mathematics class',
  image_url: 'https://example.com/image.jpg'
};

describe('classes handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createClass', () => {
    it('should create a class with unique code', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const result = await createClass(testClassInput, teacher[0].id);

      expect(result.name).toEqual('Test Math Class');
      expect(result.description).toEqual('A test mathematics class');
      expect(result.image_url).toEqual('https://example.com/image.jpg');
      expect(result.teacher_id).toEqual(teacher[0].id);
      expect(result.class_code).toBeDefined();
      expect(result.class_code.length).toEqual(6);
      expect(result.is_archived).toEqual(false);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should generate unique class codes', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const class1 = await createClass(testClassInput, teacher[0].id);
      const class2 = await createClass({
        ...testClassInput,
        name: 'Another Class'
      }, teacher[0].id);

      expect(class1.class_code).not.toEqual(class2.class_code);
    });

    it('should save class to database', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const result = await createClass(testClassInput, teacher[0].id);

      const classes = await db.select()
        .from(classesTable)
        .where(eq(classesTable.id, result.id))
        .execute();

      expect(classes).toHaveLength(1);
      expect(classes[0].name).toEqual('Test Math Class');
      expect(classes[0].teacher_id).toEqual(teacher[0].id);
    });
  });

  describe('getClassesByUser', () => {
    it('should get classes for teacher', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      // Create class
      await createClass(testClassInput, teacher[0].id);

      const classes = await getClassesByUser(teacher[0].id, 'teacher');

      expect(classes).toHaveLength(1);
      expect(classes[0].name).toEqual('Test Math Class');
      expect(classes[0].teacher_id).toEqual(teacher[0].id);
    });

    it('should get classes for student', async () => {
      // Create teacher and student
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const student = await db.insert(usersTable)
        .values(testStudent)
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      // Enroll student
      await db.insert(classEnrollmentsTable)
        .values({
          user_id: student[0].id,
          class_id: classData.id
        })
        .execute();

      const classes = await getClassesByUser(student[0].id, 'student');

      expect(classes).toHaveLength(1);
      expect(classes[0].name).toEqual('Test Math Class');
    });

    it('should return empty array for user with no classes', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const classes = await getClassesByUser(teacher[0].id, 'teacher');

      expect(classes).toHaveLength(0);
    });
  });

  describe('getClassById', () => {
    it('should get class for teacher', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      const result = await getClassById(classData.id, teacher[0].id);

      expect(result.id).toEqual(classData.id);
      expect(result.name).toEqual('Test Math Class');
    });

    it('should get class for enrolled student', async () => {
      // Create teacher and student
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const student = await db.insert(usersTable)
        .values(testStudent)
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      // Enroll student
      await db.insert(classEnrollmentsTable)
        .values({
          user_id: student[0].id,
          class_id: classData.id
        })
        .execute();

      const result = await getClassById(classData.id, student[0].id);

      expect(result.id).toEqual(classData.id);
      expect(result.name).toEqual('Test Math Class');
    });

    it('should throw error for non-enrolled user', async () => {
      // Create teacher and student
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const student = await db.insert(usersTable)
        .values(testStudent)
        .returning()
        .execute();

      // Create class (student not enrolled)
      const classData = await createClass(testClassInput, teacher[0].id);

      await expect(getClassById(classData.id, student[0].id)).rejects.toThrow(/access denied/i);
    });

    it('should throw error for non-existent class', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      await expect(getClassById(999, teacher[0].id)).rejects.toThrow(/class not found/i);
    });
  });

  describe('joinClass', () => {
    it('should enroll student in class', async () => {
      // Create teacher and student
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const student = await db.insert(usersTable)
        .values(testStudent)
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      const joinInput: JoinClassInput = {
        class_code: classData.class_code
      };

      const result = await joinClass(joinInput, student[0].id);

      expect(result.id).toEqual(classData.id);
      expect(result.name).toEqual('Test Math Class');

      // Verify enrollment was created
      const enrollments = await db.select()
        .from(classEnrollmentsTable)
        .where(and(
          eq(classEnrollmentsTable.class_id, classData.id),
          eq(classEnrollmentsTable.user_id, student[0].id)
        ))
        .execute();

      expect(enrollments).toHaveLength(1);
    });

    it('should throw error for invalid class code', async () => {
      // Create student
      const student = await db.insert(usersTable)
        .values(testStudent)
        .returning()
        .execute();

      const joinInput: JoinClassInput = {
        class_code: 'INVALID'
      };

      await expect(joinClass(joinInput, student[0].id)).rejects.toThrow(/class not found/i);
    });

    it('should throw error for already enrolled student', async () => {
      // Create teacher and student
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const student = await db.insert(usersTable)
        .values(testStudent)
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      // First enrollment
      const joinInput: JoinClassInput = {
        class_code: classData.class_code
      };

      await joinClass(joinInput, student[0].id);

      // Try to enroll again
      await expect(joinClass(joinInput, student[0].id)).rejects.toThrow(/already enrolled/i);
    });
  });

  describe('archiveClass', () => {
    it('should archive class for teacher', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      const result = await archiveClass(classData.id, teacher[0].id);

      expect(result.id).toEqual(classData.id);
      expect(result.is_archived).toEqual(true);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should throw error for non-teacher user', async () => {
      // Create teacher and student
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const student = await db.insert(usersTable)
        .values(testStudent)
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      await expect(archiveClass(classData.id, student[0].id)).rejects.toThrow(/class not found or access denied/i);
    });

    it('should throw error for non-existent class', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      await expect(archiveClass(999, teacher[0].id)).rejects.toThrow(/class not found or access denied/i);
    });
  });

  describe('getClassStudents', () => {
    it('should get enrolled students for teacher', async () => {
      // Create teacher and students
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const student1 = await db.insert(usersTable)
        .values(testStudent)
        .returning()
        .execute();

      const student2 = await db.insert(usersTable)
        .values({
          ...testStudent,
          email: 'student2@test.com',
          first_name: 'Bob'
        })
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      // Enroll students
      await db.insert(classEnrollmentsTable)
        .values([
          { user_id: student1[0].id, class_id: classData.id },
          { user_id: student2[0].id, class_id: classData.id }
        ])
        .execute();

      const students = await getClassStudents(classData.id, teacher[0].id);

      expect(students).toHaveLength(2);
      expect(students[0].first_name).toEqual('Jane');
      expect(students[1].first_name).toEqual('Bob');
      expect(students[0].enrolled_at).toBeInstanceOf(Date);
    });

    it('should return empty array for class with no students', async () => {
      // Create teacher
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      const students = await getClassStudents(classData.id, teacher[0].id);

      expect(students).toHaveLength(0);
    });

    it('should throw error for non-teacher user', async () => {
      // Create teacher and student
      const teacher = await db.insert(usersTable)
        .values(testTeacher)
        .returning()
        .execute();

      const student = await db.insert(usersTable)
        .values(testStudent)
        .returning()
        .execute();

      // Create class
      const classData = await createClass(testClassInput, teacher[0].id);

      await expect(getClassStudents(classData.id, student[0].id)).rejects.toThrow(/class not found or access denied/i);
    });
  });
});
