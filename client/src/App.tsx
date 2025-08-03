
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar } from '@/components/ui/calendar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  BookOpen, 
  Calendar as CalendarIcon, 
  Users, 
  FileText, 
  MessageSquare, 
  Bell, 
  GraduationCap,
  Plus,
  LogOut,
  Home,
  ClipboardList,
  Clock,
  CheckCircle,
  AlertCircle,
  Target,
  TrendingUp
} from 'lucide-react';
import { trpc } from '@/utils/trpc';
import type { 
  User, 
  Class, 
  Assignment, 
  StudentDashboard, 
  TeacherDashboard,
  Activity,
  Notification,
  CreateUserInput,
  LoginInput,
  CreateClassInput,
  JoinClassInput,
  CreateAssignmentInput,
  CalendarEvent,
  Submission,
  GradebookEntry
} from '../../server/src/schema';

// Auth Context
interface AuthContextType {
  user: User | null;
  login: (credentials: LoginInput) => Promise<void>;
  register: (userData: CreateUserInput) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  isLoading: false
});

function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

// Auth Provider Component
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const login = async (credentials: LoginInput) => {
    setIsLoading(true);
    try {
      const response = await trpc.login.mutate(credentials);
      setUser(response.user);
      localStorage.setItem('lms_token', response.token);
      localStorage.setItem('lms_user_id', response.user.id.toString());
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (userData: CreateUserInput) => {
    setIsLoading(true);
    try {
      await trpc.register.mutate(userData);
      // Auto-login after registration
      await login({ email: userData.email, password: userData.password });
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('lms_token');
    localStorage.removeItem('lms_user_id');
  };

  // Auto-login on app start
  useEffect(() => {
    const storedUserId = localStorage.getItem('lms_user_id');
    if (storedUserId) {
      trpc.getCurrentUser.query(parseInt(storedUserId))
        .then(setUser)
        .catch(() => logout());
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Login/Register Component
function AuthForm() {
  const { login, register, isLoading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [loginData, setLoginData] = useState<LoginInput>({
    email: '',
    password: ''
  });

  const [registerData, setRegisterData] = useState<CreateUserInput>({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'student',
    profile_image_url: null
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(loginData);
    } catch {
      setError('Invalid email or password');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await register(registerData);
    } catch {
      setError('Registration failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            EduHub LMS
          </CardTitle>
          <CardDescription>
            {isLogin ? 'Welcome back! Please sign in.' : 'Create your account to get started.'}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <Tabs value={isLogin ? 'login' : 'register'} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" onClick={() => setIsLogin(true)}>
                Sign In
              </TabsTrigger>
              <TabsTrigger value="register" onClick={() => setIsLogin(false)}>
                Sign Up
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={loginData.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setLoginData((prev: LoginInput) => ({ ...prev, email: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={loginData.password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setLoginData((prev: LoginInput) => ({ ...prev, password: e.target.value }))
                    }
                    required
                  />
                </div>
                
                {error && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-600">{error}</AlertDescription>
                  </Alert>
                )}
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      placeholder="John"
                      value={registerData.first_name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setRegisterData((prev: CreateUserInput) => ({ ...prev, first_name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      placeholder="Doe"
                      value={registerData.last_name}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setRegisterData((prev: CreateUserInput) => ({ ...prev, last_name: e.target.value }))
                      }
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john.doe@school.edu"
                    value={registerData.email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setRegisterData((prev: CreateUserInput) => ({ ...prev, email: e.target.value }))
                    }
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={registerData.password}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setRegisterData((prev: CreateUserInput) => ({ ...prev, password: e.target.value }))
                    }
                    required
                    minLength={6}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="role">I am a...</Label>
                  <Select 
                    value={registerData.role} 
                    onValueChange={(value: 'student' | 'teacher') =>
                      setRegisterData((prev: CreateUserInput) => ({ ...prev, role: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student 🎓</SelectItem>
                      <SelectItem value="teacher">Teacher 👨‍🏫</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {error && (
                  <Alert className="border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertDescription className="text-red-600">{error}</AlertDescription>
                  </Alert>
                )}
                
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// Navigation Component
function Navigation({ currentPage, onPageChange }: { 
  currentPage: string; 
  onPageChange: (page: string) => void; 
}) {
  const { user, logout } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Load notifications
  useEffect(() => {
    if (user) {
      trpc.getNotifications.query(user.id)
        .then(setNotifications)
        .catch(console.error);
    }
  }, [user]);

  const unreadCount = notifications.filter((n: Notification) => !n.is_read).length;

  const studentNavItems = [
    { key: 'dashboard', label: 'Dashboard', icon: Home },
    { key: 'classes', label: 'My Classes', icon: BookOpen },
    { key: 'assignments', label: 'Assignments', icon: ClipboardList },
    { key: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { key: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount > 0 ? unreadCount : undefined }
  ];

  const teacherNavItems = [
    { key: 'dashboard', label: 'Dashboard', icon: Home },
    { key: 'classes', label: 'My Classes', icon: BookOpen },
    { key: 'assignments', label: 'Assignments', icon: ClipboardList },
    { key: 'gradebook', label: 'Gradebook', icon: Target },
    { key: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { key: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount > 0 ? unreadCount : undefined }
  ];

  const navItems = user?.role === 'teacher' ? teacherNavItems : studentNavItems;

  return (
    <div className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                EduHub
              </span>
            </div>
            
            <nav className="hidden md:flex space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    onClick={() => onPageChange(item.key)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors relative ${
                      currentPage === item.key
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                    {item.badge && (
                      <Badge className="ml-1 h-5 min-w-5 text-xs bg-red-500 hover:bg-red-500">
                        {item.badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profile_image_url || undefined} />
                <AvatarFallback className="bg-gradient-to-r from-blue-500 to-purple-500 text-white text-xs">
                  {user?.first_name?.[0]}{user?.last_name?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-gray-600 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Dashboard Components
function StudentDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<StudentDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      trpc.getStudentDashboard.query(user.id)
        .then(setDashboard)
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [user]);

  if (isLoading) {
    return <div className="p-6">Loading dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Welcome back, {user?.first_name}! 👋
          </h1>
          <p className="text-gray-600 mt-1">Here's what's happening in your classes today.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100">Upcoming Assignments</p>
                <p className="text-2xl font-bold">{dashboard?.upcomingAssignments?.length || 0}</p>
              </div>
              <ClipboardList className="h-8 w-8 text-blue-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100">Recent Grades</p>
                <p className="text-2xl font-bold">{dashboard?.recentGrades?.length || 0}</p>
              </div>
              <Target className="h-8 w-8 text-green-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100">Notifications</p>
                <p className="text-2xl font-bold">{dashboard?.notifications?.length || 0}</p>
              </div>
              <Bell className="h-8 w-8 text-purple-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100">Calendar Events</p>
                <p className="text-2xl font-bold">{dashboard?.calendarEvents?.length || 0}</p>
              </div>
              <CalendarIcon className="h-8 w-8 text-orange-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span>Upcoming Assignments</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard?.upcomingAssignments && dashboard.upcomingAssignments.length > 0 ? (
              <div className="space-y-3">
                {dashboard.upcomingAssignments.slice(0, 5).map((assignment: Assignment) => (
                  <div key={assignment.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-900">{assignment.title}</p>
                      <p className="text-sm text-gray-600">
                        Due: {assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : 'No due date'}
                      </p>
                    </div>
                    <Badge variant={assignment.type === 'quiz' ? 'secondary' : 'default'}>
                      {assignment.type}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No upcoming assignments 🎉</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              <span>Recent Activity</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard?.recentActivities && dashboard.recentActivities.length > 0 ? (
              <div className="space-y-3">
                {dashboard.recentActivities.slice(0, 5).map((activity: Activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 rounded-lg bg-gray-50">
                    <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{activity.title || 'Class Activity'}</p>
                      <p className="text-sm text-gray-600 line-clamp-2">{activity.content}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {activity.created_at.toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TeacherDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<TeacherDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      trpc.getTeacherDashboard.query(user.id)
        .then(setDashboard)
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [user]);

  if (isLoading) {
    return <div className="p-6">Loading dashboard...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Good day, Professor {user?.last_name}! 👨‍🏫
          </h1>
          <p className="text-gray-600 mt-1">Here's an overview of your classes and students.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-gradient-to-r from-indigo-500 to-indigo-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-indigo-100">Total Classes</p>
                <p className="text-2xl font-bold">{dashboard?.classStats?.totalClasses || 0}</p>
              </div>
              <BookOpen className="h-8 w-8 text-indigo-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100">Total Students</p>
                <p className="text-2xl font-bold">{dashboard?.classStats?.totalStudents || 0}</p>
              </div>
              <Users className="h-8 w-8 text-emerald-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-amber-500 to-amber-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100">Pending Grades</p>
                <p className="text-2xl font-bold">{dashboard?.classStats?.pendingGrades || 0}</p>
              </div>
              <ClipboardList className="h-8 w-8 text-amber-200" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-r from-rose-500 to-rose-600 text-white">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-rose-100">Pending Submissions</p>
                <p className="text-2xl font-bold">{dashboard?.pendingSubmissions?.length || 0}</p>
              </div>
              <FileText className="h-8 w-8 text-rose-200" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-amber-600" />
              <span>Pending Submissions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard?.pendingSubmissions && dashboard.pendingSubmissions.length > 0 ? (
              <div className="space-y-3">
                {dashboard.pendingSubmissions.slice(0, 5).map((submission: Submission) => (
                  <div key={submission.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-900">Assignment #{submission.assignment_id}</p>
                      <p className="text-sm text-gray-600">
                        Submitted: {submission.submitted_at ? new Date(submission.submitted_at).toLocaleDateString() : 'Draft'}
                      </p>
                    </div>
                    <Badge variant="outline">{submission.status}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">All caught up! 🎉</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <span>Recent Assignments</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard?.recentAssignments && dashboard.recentAssignments.length > 0 ? (
              <div className="space-y-3">
                {dashboard.recentAssignments.slice(0, 5).map((assignment: Assignment) => (
                  <div key={assignment.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div>
                      <p className="font-medium text-gray-900">{assignment.title}</p>
                      <p className="text-sm text-gray-600">
                        Created: {assignment.created_at.toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={assignment.is_published ? 'default' : 'secondary'}>
                      {assignment.is_published ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">No recent assignments</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Classes Management Component
function ClassesManagement() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);

  const [createClassData, setCreateClassData] = useState<CreateClassInput>({
    name: '',
    description: null,
    image_url: null
  });

  const [joinClassData, setJoinClassData] = useState<JoinClassInput>({
    class_code: ''
  });

  const loadClasses = useCallback(async () =>  {
    if (user) {
      try {
        const userClasses = await trpc.getMyClasses.query({ userId: user.id, role: user.role });
        setClasses(userClasses);
      } catch (error) {
        console.error('Failed to load classes:', error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newClass = await trpc.createClass.mutate(createClassData);
      setClasses((prev: Class[]) => [...prev, newClass]);
      setCreateClassData({ name: '', description: null, image_url: null });
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Failed to create class:', error);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const joinedClass = await trpc.joinClass.mutate(joinClassData);
      setClasses((prev: Class[]) => [...prev, joinedClass]);
      setJoinClassData({ class_code: '' });
      setShowJoinDialog(false);
    } catch (error) {
      console.error('Failed to join class:', error);
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading classes...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Classes</h1>
          <p className="text-gray-600 mt-1">
            {user?.role === 'teacher' ? 'Manage your classes and students' : 'Your enrolled classes'}
          </p>
        </div>
        
        <div className="flex space-x-2">
          {user?.role === 'teacher' ? (
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Class
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleCreateClass}>
                  <DialogHeader>
                    <DialogTitle>Create New Class</DialogTitle>
                    <DialogDescription>
                      Set up a new class for your students to join.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="class-name">Class Name</Label>
                      <Input
                        id="class-name"
                        placeholder="e.g., Advanced Mathematics"
                        value={createClassData.name}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setCreateClassData((prev: CreateClassInput) => ({ ...prev, name: e.target.value }))
                        }
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="class-description">Description (Optional)</Label>
                      <Textarea
                        id="class-description"
                        placeholder="Brief description of the class..."
                        value={createClassData.description || ''}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                          setCreateClassData((prev: CreateClassInput) => ({ 
                            ...prev, 
                            description: e.target.value || null 
                          }))
                        }
                      />
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Create Class</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Join Class
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleJoinClass}>
                  <DialogHeader>
                    <DialogTitle>Join a Class</DialogTitle>
                    <DialogDescription>
                      Enter the class code provided by your teacher.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="class-code">Class Code</Label>
                      <Input
                        id="class-code"
                        placeholder="Enter 6-digit class code"
                        value={joinClassData.class_code}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setJoinClassData((prev: JoinClassInput) => ({ ...prev, class_code: e.target.value.toUpperCase() }))
                        }
                        required
                      />
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setShowJoinDialog(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">Join Class</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {user?.role === 'teacher' ? 'No classes created yet' : 'No classes joined yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {user?.role === 'teacher' 
                ? 'Create your first class to start teaching and managing students.'
                : 'Join your first class using a class code from your teacher.'
              }
            </p>
            <Button
              onClick={() => user?.role === 'teacher' ? setShowCreateDialog(true) : setShowJoinDialog(true)}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              {user?.role === 'teacher' ? 'Create First Class' : 'Join First Class'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((classItem: Class) => (
            <Card key={classItem.id} className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-0">
                <div className="h-32 bg-gradient-to-r from-blue-500 to-purple-600 rounded-t-lg relative">
                  <div className="absolute inset-0 bg-black bg-opacity-20 rounded-t-lg flex items-center justify-center">
                    <BookOpen className="h-8 w-8 text-white" />
                  </div>
                </div>
                
                <div className="p-6">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                      {classItem.name}
                    </h3>
                    {classItem.is_archived && (
                      <Badge variant="secondary">Archived</Badge>
                    )}
                  </div>
                  
                  {classItem.description && (
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                      {classItem.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Code: {classItem.class_code}</span>
                    <span>{classItem.created_at.toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Assignments Component
function AssignmentsManagement() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);

  const [createAssignmentData, setCreateAssignmentData] = useState<CreateAssignmentInput>({
    title: '',
    description: null,
    type: 'assignment',
    class_id: 0,
    due_date: null,
    publish_date: new Date(),
    max_points: undefined,
    allow_late_submission: true,
    is_published: false,
    rubric_data: null
  });

  const loadAssignments = useCallback(async () => {
    if (user) {
      try {
        const upcomingAssignments = await trpc.getUpcomingAssignments.query(user.id);
        setAssignments(upcomingAssignments);
      } catch (error) {
        console.error('Failed to load assignments:', error);
      } finally {
        setIsLoading(false);
      }
    }
  }, [user]);

  const loadClasses = useCallback(async () => {
    if (user) {
      try {
        const userClasses = await trpc.getMyClasses.query({ userId: user.id, role: user.role });
        setClasses(userClasses);
        // Set first class as default if available
        if (userClasses.length > 0) {
          setCreateAssignmentData((prev: CreateAssignmentInput) => ({ 
            ...prev, 
            class_id: userClasses[0].id 
          }));
        }
      } catch (error) {
        console.error('Failed to load classes:', error);
      }
    }
  }, [user]);

  useEffect(() => {
    loadAssignments();
    loadClasses();
  }, [loadAssignments, loadClasses]);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newAssignment = await trpc.createAssignment.mutate(createAssignmentData);
      setAssignments((prev: Assignment[]) => [...prev, newAssignment]);
      setCreateAssignmentData({
        title: '',
        description: null,
        type: 'assignment',
        class_id: classes.length > 0 ? classes[0].id : 0,
        due_date: null,
        publish_date: new Date(),
        max_points: undefined,
        allow_late_submission: true,
        is_published: false,
        rubric_data: null
      });
      setShowCreateDialog(false);
    } catch (error) {
      console.error('Failed to create assignment:', error);
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading assignments...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Assignments</h1>
          <p className="text-gray-600 mt-1">
            {user?.role === 'teacher' ? 'Create and manage assignments for your classes' : 'View and submit your assignments'}
          </p>
        </div>
        
        {user?.role === 'teacher' && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Create Assignment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <form onSubmit={handleCreateAssignment}>
                <DialogHeader>
                  <DialogTitle>Create New Assignment</DialogTitle>
                  <DialogDescription>
                    Create a new assignment, quiz, or question for your students.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4 max-h-96 overflow-y-auto">
                  <div className="space-y-2">
                    <Label htmlFor="assignment-title">Title</Label>
                    <Input
                      id="assignment-title"
                      placeholder="Assignment title"
                      value={createAssignmentData.title}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCreateAssignmentData((prev: CreateAssignmentInput) => ({ ...prev, title: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="assignment-type">Type</Label>
                      <Select 
                        value={createAssignmentData.type} 
                        onValueChange={(value: 'assignment' | 'quiz' | 'question') =>
                          setCreateAssignmentData((prev: CreateAssignmentInput) => ({ ...prev, type: value }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="assignment">📝 Assignment</SelectItem>
                          <SelectItem value="quiz">🧩 Quiz</SelectItem>
                          <SelectItem value="question">❓ Question</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="assignment-class">Class</Label>
                      <Select 
                        value={createAssignmentData.class_id > 0 ? createAssignmentData.class_id.toString() : ''} 
                        onValueChange={(value: string) =>
                          setCreateAssignmentData((prev: CreateAssignmentInput) => ({ ...prev, class_id: parseInt(value) }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map((classItem: Class) => (
                            <SelectItem key={classItem.id} value={classItem.id.toString()}>
                              {classItem.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="assignment-description">Description</Label>
                    <Textarea
                      id="assignment-description"
                      placeholder="Assignment instructions and details..."
                      value={createAssignmentData.description || ''}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                        setCreateAssignmentData((prev: CreateAssignmentInput) => ({ 
                          ...prev, 
                          description: e.target.value || null 
                        }))
                      }
                      rows={4}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="assignment-points">Max Points</Label>
                      <Input
                        id="assignment-points"
                        type="number"
                        placeholder="100"
                        value={createAssignmentData.max_points || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setCreateAssignmentData((prev: CreateAssignmentInput) => ({ 
                            ...prev, 
                            max_points: e.target.value ? parseFloat(e.target.value) : undefined 
                          }))
                        }
                        min="0"
                        step="0.5"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="assignment-due-date">Due Date</Label>
                      <Input
                        id="assignment-due-date"
                        type="datetime-local"
                        value={createAssignmentData.due_date ? new Date(createAssignmentData.due_date).toISOString().slice(0, 16) : ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setCreateAssignmentData((prev: CreateAssignmentInput) => ({ 
                            ...prev, 
                            due_date: e.target.value ? new Date(e.target.value) : null 
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="allow-late"
                        checked={createAssignmentData.allow_late_submission}
                        onCheckedChange={(checked: boolean) =>
                          setCreateAssignmentData((prev: CreateAssignmentInput) => ({ ...prev, allow_late_submission: checked }))
                        }
                      />
                      <Label htmlFor="allow-late">Allow late submissions</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        id="publish-now"
                        checked={createAssignmentData.is_published}
                        onCheckedChange={(checked: boolean) =>
                          setCreateAssignmentData((prev: CreateAssignmentInput) => ({ ...prev, is_published: checked }))
                        }
                      />
                      <Label htmlFor="publish-now">Publish immediately</Label>
                    </div>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create Assignment</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ClipboardList className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {user?.role === 'teacher' ? 'No assignments created yet' : 'No assignments due'}
            </h3>
            <p className="text-gray-600 mb-4">
              {user?.role === 'teacher' 
                ? 'Create your first assignment to give students work to do.'
                : 'All caught up! No assignments are currently due.'
              }
            </p>
            {user?.role === 'teacher' && (
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create First Assignment
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment: Assignment) => (
            <Card key={assignment.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {assignment.title}
                      </h3>
                      <Badge variant={assignment.type === 'quiz' ? 'secondary' : assignment.type === 'question' ? 'outline' : 'default'}>
                        {assignment.type}
                      </Badge>
                      {!assignment.is_published && (
                        <Badge variant="outline">Draft</Badge>
                      )}
                    </div>
                    
                    {assignment.description && (
                      <p className="text-gray-600 mb-3 line-clamp-2">
                        {assignment.description}
                      </p>
                    )}
                    
                    <div className="flex items-center space-x-6 text-sm text-gray-500">
                      {assignment.due_date && (
                        <div className="flex items-center space-x-1">
                          <Clock className="h-4 w-4" />
                          <span>Due: {new Date(assignment.due_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      {assignment.max_points && (
                        <div className="flex items-center space-x-1">
                          <Target className="h-4 w-4" />
                          <span>{assignment.max_points} points</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-1">
                        <CalendarIcon className="h-4 w-4" />
                        <span>Created: {assignment.created_at.toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                    {user?.role === 'student' && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700">
                        Submit Work
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Simple Calendar Component
function CalendarView() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  useEffect(() => {
    if (user) {
      trpc.getCalendarEvents.query({ userId: user.id })
        .then(setEvents)
        .catch(console.error);
    }
  }, [user]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-600 mt-1">View assignment due dates and class events</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border"
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming Events</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No upcoming events</p>
            ) : (
              <div className="space-y-3">
                {events.slice(0, 10).map((event: CalendarEvent) => (
                  <div key={event.id} className="flex items-center space-x-3 p-3 rounded-lg bg-gray-50">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{event.title}</p>
                      <p className="text-sm text-gray-600">
                        {new Date(event.event_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline">{event.event_type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Notifications Component
function NotificationsView() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      trpc.getNotifications.query(user.id)
        .then(setNotifications)
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [user]);

  const handleMarkAsRead = async (notificationId: number) => {
    if (!user) return;
    try {
      await trpc.markNotificationAsRead.mutate({ notificationId, userId: user.id });
      setNotifications((prev: Notification[]) => 
        prev.map((n: Notification) => n.id === notificationId ? { ...n, is_read: true } : n)
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    try {
      await trpc.markAllNotificationsAsRead.mutate(user.id);
      setNotifications((prev: Notification[]) => 
        prev.map((n: Notification) => ({ ...n, is_read: true }))
      );
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading notifications...</div>;
  }

  const unreadCount = notifications.filter((n: Notification) => !n.is_read).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-600 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notifications` : 'All caught up!'}
          </p>
        </div>
        
        {unreadCount > 0 && (
          <Button 
            variant="outline" 
            onClick={handleMarkAllAsRead}
            className="text-blue-600 border-blue-600 hover:bg-blue-50"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Mark All as Read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications yet</h3>
            <p className="text-gray-600">We'll notify you when there's something important!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification: Notification) => (
            <Card 
              key={notification.id} 
              className={`cursor-pointer transition-all hover:shadow-md ${
                !notification.is_read ? 'border-blue-200 bg-blue-50' : 'bg-white'
              }`}
              onClick={() => !notification.is_read && handleMarkAsRead(notification.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${
                    !notification.is_read ? 'bg-blue-600' : 'bg-gray-300'
                  }`} />
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium text-gray-900">{notification.title}</h4>
                      <span className="text-xs text-gray-500">
                        {notification.created_at.toLocaleDateString()}
                      </span>
                    </div>
                    
                    <p className="text-gray-600 text-sm">{notification.message}</p>
                    
                    <div className="flex items-center justify-between mt-2">
                      <Badge variant="outline" className="text-xs">
                        {notification.type.replace('_', ' ')}
                      </Badge>
                      
                      {!notification.is_read && (
                        <span className="text-xs text-blue-600 font-medium">New</span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Gradebook Component (Teacher only)
function GradebookView() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [gradebook, setGradebook] = useState<GradebookEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user && user.role === 'teacher') {
      trpc.getMyClasses.query({ userId: user.id, role: user.role })
        .then((userClasses: Class[]) => {
          setClasses(userClasses);
          if (userClasses.length > 0) {
            setSelectedClassId(userClasses[0].id);
          }
        })
        .catch(console.error)
        .finally(() => setIsLoading(false));
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedClassId) {
      trpc.getGradebookByClass.query({ classId: selectedClassId, teacherId: user.id })
        .then(setGradebook)
        .catch(console.error);
    }
  }, [user, selectedClassId]);

  if (user?.role !== 'teacher') {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Gradebook is only available for teachers.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return <div className="p-6">Loading gradebook...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gradebook</h1>
          <p className="text-gray-600 mt-1">View and manage student grades</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select 
            value={selectedClassId ? selectedClassId.toString() : ''} 
            onValueChange={(value: string) => setSelectedClassId(parseInt(value))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((classItem: Class) => (
                <SelectItem key={classItem.id} value={classItem.id.toString()}>
                  {classItem.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="outline">Export Grades</Button>
        </div>
      </div>

      {classes.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No classes found</h3>
            <p className="text-gray-600">Create a class first to start grading students.</p>
          </CardContent>
        </Card>
      ) : gradebook.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No grades yet</h3>
            <p className="text-gray-600">Grades will appear here once you start grading assignments.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Class Grades</CardTitle>
            <CardDescription>
              Showing grades for {classes.find((c: Class) => c.id === selectedClassId)?.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {gradebook.map((entry: GradebookEntry) => (
                <div key={entry.id} className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">Student #{entry.student_id}</p>
                    <p className="text-sm text-gray-600">Assignment #{entry.assignment_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {entry.points_earned || 0} / {entry.points_possible}
                    </p>
                    <p className="text-sm text-gray-600">
                      {entry.percentage ? `${entry.percentage}%` : 'Not graded'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Main App Component
function MainApp() {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return user?.role === 'teacher' ? <TeacherDashboard /> : <StudentDashboard />;
      case 'classes':
        return <ClassesManagement />;
      case 'assignments':
        return <AssignmentsManagement />;
      case 'gradebook':
        return <GradebookView />;
      case 'calendar':
        return <CalendarView />;
      case 'notifications':
        return <NotificationsView />;
      default:
        return user?.role === 'teacher' ? <TeacherDashboard /> : <StudentDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="max-w-7xl mx-auto">
        {renderPage()}
      </main>
    </div>
  );
}

// Root App Component
function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen">
        <AuthContext.Consumer>
          {({ user }: AuthContextType) => user ? <MainApp /> : <AuthForm />}
        </AuthContext.Consumer>
      </div>
    </AuthProvider>
  );
}

export default App;
