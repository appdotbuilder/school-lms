
import { db } from '../db';
import { gradebookTable, assignmentsTable, usersTable, classesTable } from '../db/schema';
import { type GradebookEntry } from '../schema';
import { eq, and, avg, isNull, isNotNull } from 'drizzle-orm';

export async function getGradebookByClass(classId: number, teacherId: number): Promise<GradebookEntry[]> {
  try {
    // Verify teacher owns the class
    const classCheck = await db.select()
      .from(classesTable)
      .where(and(
        eq(classesTable.id, classId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (classCheck.length === 0) {
      throw new Error('Class not found or access denied');
    }

    // Get all gradebook entries for the class
    const results = await db.select()
      .from(gradebookTable)
      .where(eq(gradebookTable.class_id, classId))
      .execute();

    return results.map(entry => ({
      ...entry,
      percentage: entry.percentage || null,
    }));
  } catch (error) {
    console.error('Failed to get gradebook by class:', error);
    throw error;
  }
}

export async function getStudentGrades(studentId: number, classId?: number): Promise<GradebookEntry[]> {
  try {
    // Build query conditions
    const conditions = [eq(gradebookTable.student_id, studentId)];
    
    if (classId !== undefined) {
      conditions.push(eq(gradebookTable.class_id, classId));
    }

    const results = await db.select()
      .from(gradebookTable)
      .where(and(...conditions))
      .execute();

    return results.map(entry => ({
      ...entry,
      percentage: entry.percentage || null,
    }));
  } catch (error) {
    console.error('Failed to get student grades:', error);
    throw error;
  }
}

export async function updateGradebookEntry(studentId: number, assignmentId: number, pointsEarned: number, teacherId: number): Promise<GradebookEntry> {
  try {
    // Get assignment details and verify teacher owns it
    const assignmentResult = await db.select()
      .from(assignmentsTable)
      .innerJoin(classesTable, eq(assignmentsTable.class_id, classesTable.id))
      .where(and(
        eq(assignmentsTable.id, assignmentId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (assignmentResult.length === 0) {
      throw new Error('Assignment not found or access denied');
    }

    const assignment = assignmentResult[0].assignments;
    const classData = assignmentResult[0].classes;
    const pointsPossible = assignment.max_points || 100;
    const percentage = Math.round((pointsEarned / pointsPossible) * 100);

    // Calculate letter grade
    let letterGrade: string | null = null;
    if (percentage >= 90) letterGrade = 'A';
    else if (percentage >= 80) letterGrade = 'B';
    else if (percentage >= 70) letterGrade = 'C';
    else if (percentage >= 60) letterGrade = 'D';
    else letterGrade = 'F';

    // Check if entry exists
    const existingEntry = await db.select()
      .from(gradebookTable)
      .where(and(
        eq(gradebookTable.student_id, studentId),
        eq(gradebookTable.assignment_id, assignmentId)
      ))
      .execute();

    let result;
    if (existingEntry.length > 0) {
      // Update existing entry
      const updateResult = await db.update(gradebookTable)
        .set({
          points_earned: pointsEarned,
          percentage: percentage,
          letter_grade: letterGrade,
          is_excused: false,
          updated_at: new Date(),
        })
        .where(and(
          eq(gradebookTable.student_id, studentId),
          eq(gradebookTable.assignment_id, assignmentId)
        ))
        .returning()
        .execute();
      
      result = updateResult[0];
    } else {
      // Create new entry
      const insertResult = await db.insert(gradebookTable)
        .values({
          student_id: studentId,
          class_id: classData.id,
          assignment_id: assignmentId,
          points_earned: pointsEarned,
          points_possible: pointsPossible,
          percentage: percentage,
          letter_grade: letterGrade,
          is_excused: false,
        })
        .returning()
        .execute();
      
      result = insertResult[0];
    }

    return {
      ...result,
      percentage: result.percentage || null,
    };
  } catch (error) {
    console.error('Failed to update gradebook entry:', error);
    throw error;
  }
}

export async function excuseAssignment(studentId: number, assignmentId: number, teacherId: number): Promise<GradebookEntry> {
  try {
    // Get assignment details and verify teacher owns it
    const assignmentResult = await db.select()
      .from(assignmentsTable)
      .innerJoin(classesTable, eq(assignmentsTable.class_id, classesTable.id))
      .where(and(
        eq(assignmentsTable.id, assignmentId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (assignmentResult.length === 0) {
      throw new Error('Assignment not found or access denied');
    }

    const assignment = assignmentResult[0].assignments;
    const classData = assignmentResult[0].classes;
    const pointsPossible = assignment.max_points || 100;

    // Check if entry exists
    const existingEntry = await db.select()
      .from(gradebookTable)
      .where(and(
        eq(gradebookTable.student_id, studentId),
        eq(gradebookTable.assignment_id, assignmentId)
      ))
      .execute();

    let result;
    if (existingEntry.length > 0) {
      // Update existing entry to excused
      const updateResult = await db.update(gradebookTable)
        .set({
          points_earned: null,
          percentage: null,
          letter_grade: null,
          is_excused: true,
          updated_at: new Date(),
        })
        .where(and(
          eq(gradebookTable.student_id, studentId),
          eq(gradebookTable.assignment_id, assignmentId)
        ))
        .returning()
        .execute();
      
      result = updateResult[0];
    } else {
      // Create new excused entry
      const insertResult = await db.insert(gradebookTable)
        .values({
          student_id: studentId,
          class_id: classData.id,
          assignment_id: assignmentId,
          points_earned: null,
          points_possible: pointsPossible,
          percentage: null,
          letter_grade: null,
          is_excused: true,
        })
        .returning()
        .execute();
      
      result = insertResult[0];
    }

    return {
      ...result,
      percentage: result.percentage || null,
    };
  } catch (error) {
    console.error('Failed to excuse assignment:', error);
    throw error;
  }
}

export async function getClassAverages(classId: number, teacherId: number): Promise<{ assignmentId: number; average: number }[]> {
  try {
    // Verify teacher owns the class
    const classCheck = await db.select()
      .from(classesTable)
      .where(and(
        eq(classesTable.id, classId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (classCheck.length === 0) {
      throw new Error('Class not found or access denied');
    }

    // Calculate averages for each assignment, excluding excused entries
    const results = await db.select({
      assignment_id: gradebookTable.assignment_id,
      average: avg(gradebookTable.percentage),
    })
      .from(gradebookTable)
      .where(and(
        eq(gradebookTable.class_id, classId),
        eq(gradebookTable.is_excused, false),
        isNotNull(gradebookTable.percentage)
      ))
      .groupBy(gradebookTable.assignment_id)
      .execute();

    return results.map(result => ({
      assignmentId: result.assignment_id,
      average: parseFloat(result.average || '0'),
    }));
  } catch (error) {
    console.error('Failed to get class averages:', error);
    throw error;
  }
}

export async function exportGradebook(classId: number, teacherId: number): Promise<any[]> {
  try {
    // Verify teacher owns the class
    const classCheck = await db.select()
      .from(classesTable)
      .where(and(
        eq(classesTable.id, classId),
        eq(classesTable.teacher_id, teacherId)
      ))
      .execute();

    if (classCheck.length === 0) {
      throw new Error('Class not found or access denied');
    }

    // Get detailed gradebook data with student and assignment info
    const results = await db.select({
      student_id: gradebookTable.student_id,
      student_first_name: usersTable.first_name,
      student_last_name: usersTable.last_name,
      assignment_id: gradebookTable.assignment_id,
      assignment_title: assignmentsTable.title,
      points_earned: gradebookTable.points_earned,
      points_possible: gradebookTable.points_possible,
      percentage: gradebookTable.percentage,
      letter_grade: gradebookTable.letter_grade,
      is_excused: gradebookTable.is_excused,
      updated_at: gradebookTable.updated_at,
    })
      .from(gradebookTable)
      .innerJoin(usersTable, eq(gradebookTable.student_id, usersTable.id))
      .innerJoin(assignmentsTable, eq(gradebookTable.assignment_id, assignmentsTable.id))
      .where(eq(gradebookTable.class_id, classId))
      .execute();

    return results.map(entry => ({
      ...entry,
      percentage: entry.percentage || null,
    }));
  } catch (error) {
    console.error('Failed to export gradebook:', error);
    throw error;
  }
}
