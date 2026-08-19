import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import {
  type User,
  type Job,
  type Application,
  type CVFile,
  type ProfileItem,
  type RecruiterApplication,
  type AppStatus,
  type RecruiterAppStatus,
  type ProfileItemType,
  type Role,
  USERS,
  JOBS,
  APPLICATIONS,
  CV_FILES,
  PROFILE_ITEMS,
  RECRUITER_APPLICATIONS,
  COMPANIES,
  type Company,
} from "../data/mockData";

interface AppContextType {
  currentUser: User | null;
  darkMode: boolean;
  users: User[];
  jobs: Job[];
  companies: Company[];
  applications: Application[];
  cvFiles: CVFile[];
  profileItems: ProfileItem[];
  recruiterApplications: RecruiterApplication[];
  savedJobs: Set<string>;

  toggleDarkMode: () => void;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  register: (name: string, email: string, password: string) => boolean;

  toggleSaveJob: (jobId: string) => void;
  applyToJob: (jobId: string, cvId: string, coverLetter: string) => void;
  withdrawApplication: (appId: string) => void;
  updateApplicationStatus: (appId: string, status: AppStatus, note: string) => void;

  addProfileItem: (item: Omit<ProfileItem, "id" | "userId">) => void;
  updateProfileItem: (id: string, data: Partial<ProfileItem>) => void;
  deleteProfileItem: (id: string) => void;
  updateProfile: (data: Partial<Pick<User, "name" | "phone" | "avatar">>) => void;

  uploadCV: (name: string) => void;
  renameCV: (id: string, name: string) => void;
  deleteCV: (id: string) => void;
  setDefaultCV: (id: string) => void;

  submitRecruiterApplication: (data: Omit<RecruiterApplication, "id" | "userId" | "status" | "submittedAt">) => void;
  updateRecruiterApplication: (id: string, status: RecruiterAppStatus, adminNote?: string) => void;

  createJob: (data: Omit<Job, "id" | "createdAt" | "recruiterId">) => void;
  updateJobStatus: (id: string, status: Job["status"]) => void;

  changeUserRole: (userId: string, role: Role) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [users, setUsers] = useState<User[]>(USERS);
  const [jobs, setJobs] = useState<Job[]>(JOBS);
  const [applications, setApplications] = useState<Application[]>(APPLICATIONS);
  const [cvFiles, setCvFiles] = useState<CVFile[]>(CV_FILES);
  const [profileItems, setProfileItems] = useState<ProfileItem[]>(PROFILE_ITEMS);
  const [recruiterApplications, setRecruiterApplications] = useState<RecruiterApplication[]>(RECRUITER_APPLICATIONS);
  const [savedJobs, setSavedJobs] = useState<Set<string>>(new Set(["j2", "j4"]));

  const toggleDarkMode = useCallback(() => {
    setDarkMode((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }, []);

  const login = useCallback(
    (email: string, password: string): boolean => {
      const user = users.find((u) => u.email === email && u.password === password);
      if (user) {
        setCurrentUser(user);
        return true;
      }
      return false;
    },
    [users]
  );

  const logout = useCallback(() => setCurrentUser(null), []);

  const register = useCallback(
    (name: string, email: string, password: string): boolean => {
      if (users.find((u) => u.email === email)) return false;
      const newUser: User = {
        id: `u${Date.now()}`,
        name,
        email,
        password,
        role: "candidate",
      };
      setUsers((prev) => [...prev, newUser]);
      setCurrentUser(newUser);
      return true;
    },
    [users]
  );

  const toggleSaveJob = useCallback((jobId: string) => {
    setSavedJobs((prev) => {
      const next = new Set(prev);
      next.has(jobId) ? next.delete(jobId) : next.add(jobId);
      return next;
    });
  }, []);

  const applyToJob = useCallback(
    (jobId: string, cvId: string, coverLetter: string) => {
      if (!currentUser) return;
      const app: Application = {
        id: `app${Date.now()}`,
        jobId,
        candidateId: currentUser.id,
        cvId,
        coverLetter,
        status: "submitted",
        stages: [{ status: "submitted", date: new Date().toISOString().split("T")[0], note: "Đã nộp đơn thành công" }],
        submittedAt: new Date().toISOString().split("T")[0],
      };
      setApplications((prev) => [...prev, app]);
    },
    [currentUser]
  );

  const withdrawApplication = useCallback((appId: string) => {
    setApplications((prev) =>
      prev.map((a) =>
        a.id === appId
          ? {
              ...a,
              status: "withdrawn",
              stages: [
                ...a.stages,
                { status: "withdrawn", date: new Date().toISOString().split("T")[0], note: "Ứng viên đã rút đơn" },
              ],
            }
          : a
      )
    );
  }, []);

  const updateApplicationStatus = useCallback((appId: string, status: AppStatus, note: string) => {
    setApplications((prev) =>
      prev.map((a) =>
        a.id === appId
          ? {
              ...a,
              status,
              stages: [...a.stages, { status, date: new Date().toISOString().split("T")[0], note }],
            }
          : a
      )
    );
  }, []);

  const addProfileItem = useCallback(
    (item: Omit<ProfileItem, "id" | "userId">) => {
      if (!currentUser) return;
      setProfileItems((prev) => [...prev, { ...item, id: `pi${Date.now()}`, userId: currentUser.id }]);
    },
    [currentUser]
  );

  const updateProfileItem = useCallback((id: string, data: Partial<ProfileItem>) => {
    setProfileItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...data } : i)));
  }, []);

  const deleteProfileItem = useCallback((id: string) => {
    setProfileItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateProfile = useCallback(
    (data: Partial<Pick<User, "name" | "phone" | "avatar">>) => {
      if (!currentUser) return;
      setCurrentUser((prev) => (prev ? { ...prev, ...data } : prev));
      setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, ...data } : u)));
    },
    [currentUser]
  );

  const uploadCV = useCallback(
    (name: string) => {
      if (!currentUser) return;
      const isFirst = !cvFiles.some((c) => c.userId === currentUser.id);
      const newCV: CVFile = {
        id: `cv${Date.now()}`,
        userId: currentUser.id,
        name,
        fileUrl: "#",
        isDefault: isFirst,
        uploadedAt: new Date().toISOString().split("T")[0],
      };
      setCvFiles((prev) => [...prev, newCV]);
    },
    [currentUser, cvFiles]
  );

  const renameCV = useCallback((id: string, name: string) => {
    setCvFiles((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  }, []);

  const deleteCV = useCallback((id: string) => {
    setCvFiles((prev) => {
      const next = prev.filter((c) => c.id !== id);
      const wasDefault = prev.find((c) => c.id === id)?.isDefault;
      if (wasDefault && next.length > 0) {
        next[0].isDefault = true;
      }
      return next;
    });
  }, []);

  const setDefaultCV = useCallback((id: string) => {
    setCvFiles((prev) => prev.map((c) => ({ ...c, isDefault: c.id === id })));
  }, []);

  const submitRecruiterApplication = useCallback(
    (data: Omit<RecruiterApplication, "id" | "userId" | "status" | "submittedAt">) => {
      if (!currentUser) return;
      const app: RecruiterApplication = {
        ...data,
        id: `ra${Date.now()}`,
        userId: currentUser.id,
        status: "pending",
        submittedAt: new Date().toISOString().split("T")[0],
      };
      setRecruiterApplications((prev) => [...prev, app]);
    },
    [currentUser]
  );

  const updateRecruiterApplication = useCallback(
    (id: string, status: RecruiterAppStatus, adminNote?: string) => {
      setRecruiterApplications((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status, ...(adminNote !== undefined ? { adminNote } : {}) } : a))
      );
      if (status === "approved") {
        const ra = recruiterApplications.find((a) => a.id === id);
        if (ra) {
          setUsers((prev) => prev.map((u) => (u.id === ra.userId ? { ...u, role: "recruiter" } : u)));
          if (currentUser?.id === ra.userId) setCurrentUser((prev) => (prev ? { ...prev, role: "recruiter" } : prev));
        }
      }
    },
    [recruiterApplications, currentUser]
  );

  const createJob = useCallback(
    (data: Omit<Job, "id" | "createdAt" | "recruiterId">) => {
      if (!currentUser) return;
      const newJob: Job = {
        ...data,
        id: `j${Date.now()}`,
        createdAt: new Date().toISOString().split("T")[0],
        recruiterId: currentUser.id,
      };
      setJobs((prev) => [...prev, newJob]);
    },
    [currentUser]
  );

  const updateJobStatus = useCallback((id: string, status: Job["status"]) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status } : j)));
  }, []);

  const changeUserRole = useCallback((userId: string, role: Role) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
    if (currentUser?.id === userId) setCurrentUser((prev) => (prev ? { ...prev, role } : prev));
  }, [currentUser]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        darkMode,
        users,
        jobs,
        companies: COMPANIES,
        applications,
        cvFiles,
        profileItems,
        recruiterApplications,
        savedJobs,
        toggleDarkMode,
        login,
        logout,
        register,
        toggleSaveJob,
        applyToJob,
        withdrawApplication,
        updateApplicationStatus,
        addProfileItem,
        updateProfileItem,
        deleteProfileItem,
        updateProfile,
        uploadCV,
        renameCV,
        deleteCV,
        setDefaultCV,
        submitRecruiterApplication,
        updateRecruiterApplication,
        createJob,
        updateJobStatus,
        changeUserRole,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
