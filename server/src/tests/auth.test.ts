
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type LoginInput } from '../schema';
import { registerUser, loginUser, getCurrentUser } from '../handlers/auth';
import { eq } from 'drizzle-orm';

const testUserInput: CreateUserInput = {
  email: 'test@example.com',
  password: 'password123',
  first_name: 'John',
  last_name: 'Doe',
  role: 'student',
  profile_image_url: 'https://example.com/avatar.jpg'
};

const testLoginInput: LoginInput = {
  email: 'test@example.com',
  password: 'password123'
};

describe('registerUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a user', async () => {
    const result = await registerUser(testUserInput);

    expect(result.email).toEqual('test@example.com');
    expect(result.first_name).toEqual('John');
    expect(result.last_name).toEqual('Doe');
    expect(result.role).toEqual('student');
    expect(result.profile_image_url).toEqual('https://example.com/avatar.jpg');
    expect(result.is_active).toBe(true);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.password_hash).toBeDefined();
  });

  it('should save user to database with hashed password', async () => {
    const result = await registerUser(testUserInput);

    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, result.id))
      .execute();

    expect(users).toHaveLength(1);
    const user = users[0];
    expect(user.email).toEqual('test@example.com');
    expect(user.password_hash).toBeDefined();
    expect(user.password_hash).not.toEqual('password123');
    expect(user.first_name).toEqual('John');
    expect(user.last_name).toEqual('Doe');
    expect(user.role).toEqual('student');
    expect(user.is_active).toBe(true);
  });

  it('should handle duplicate email', async () => {
    await registerUser(testUserInput);

    expect(registerUser(testUserInput)).rejects.toThrow(/duplicate key value/i);
  });

  it('should create user with null profile image', async () => {
    const inputWithoutImage: CreateUserInput = {
      email: 'noimage@example.com',
      password: 'password123',
      first_name: 'Jane',
      last_name: 'Smith',
      role: 'teacher'
    };

    const result = await registerUser(inputWithoutImage);

    expect(result.profile_image_url).toBeNull();
  });
});

describe('loginUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should authenticate user and return token', async () => {
    // Create user first
    await registerUser(testUserInput);

    const result = await loginUser(testLoginInput);

    expect(result.user.email).toEqual('test@example.com');
    expect(result.user.first_name).toEqual('John');
    expect(result.user.role).toEqual('student');
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
  });

  it('should reject invalid email', async () => {
    const invalidLogin: LoginInput = {
      email: 'nonexistent@example.com',
      password: 'password123'
    };

    expect(loginUser(invalidLogin)).rejects.toThrow(/invalid credentials/i);
  });

  it('should reject invalid password', async () => {
    await registerUser(testUserInput);

    const invalidLogin: LoginInput = {
      email: 'test@example.com',
      password: 'wrongpassword'
    };

    expect(loginUser(invalidLogin)).rejects.toThrow(/invalid credentials/i);
  });

  it('should reject deactivated user', async () => {
    const user = await registerUser(testUserInput);

    // Deactivate user
    await db.update(usersTable)
      .set({ is_active: false })
      .where(eq(usersTable.id, user.id))
      .execute();

    expect(loginUser(testLoginInput)).rejects.toThrow(/account is deactivated/i);
  });

  it('should generate valid token payload', async () => {
    await registerUser(testUserInput);

    const result = await loginUser(testLoginInput);

    // Decode token to verify contents
    const tokenPayload = JSON.parse(atob(result.token));
    expect(tokenPayload.userId).toBeDefined();
    expect(tokenPayload.email).toEqual('test@example.com');
    expect(tokenPayload.role).toEqual('student');
    expect(tokenPayload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });
});

describe('getCurrentUser', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should return user by id', async () => {
    const createdUser = await registerUser(testUserInput);

    const result = await getCurrentUser(createdUser.id);

    expect(result.id).toEqual(createdUser.id);
    expect(result.email).toEqual('test@example.com');
    expect(result.first_name).toEqual('John');
    expect(result.last_name).toEqual('Doe');
    expect(result.role).toEqual('student');
  });

  it('should reject nonexistent user id', async () => {
    expect(getCurrentUser(99999)).rejects.toThrow(/user not found/i);
  });

  it('should return complete user data', async () => {
    const createdUser = await registerUser(testUserInput);

    const result = await getCurrentUser(createdUser.id);

    expect(result.password_hash).toBeDefined();
    expect(result.is_active).toBe(true);
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
    expect(result.profile_image_url).toEqual('https://example.com/avatar.jpg');
  });
});
