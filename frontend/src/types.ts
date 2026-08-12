export type ProfileRole = 'candidate' | 'recruiter' | 'admin';
export type CompanyMemberRole = 'owner' | 'recruiter' | 'member';
export type CompanyVerificationStatus = 'pending' | 'verified' | 'rejected';
export type JobPostStatus = 'draft' | 'published' | 'closed' | 'archived';
export type EmploymentType = 'full_time' | 'part_time' | 'internship' | 'contract' | 'remote' | 'hybrid';
export type ApplicationStatus = 'pending' | 'screening' | 'interview' | 'offer' | 'accepted' | 'rejected' | 'withdrawn';
export type RecruiterRegistrationStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: ProfileRole;
  created_at?: string;
  updated_at?: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  logo_storage_path: string | null;
  description: string | null;
  created_by_user_id: string;
  verification_status: CompanyVerificationStatus;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  role: CompanyMemberRole;
  is_active: boolean;
  invited_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  company?: Company; // Joined company
}

export interface UserProfileLine {
  id: string;
  user_id: string;
  line_type: 'summary' | 'experience' | 'education' | 'skill' | 'project' | 'certification' | 'language' | 'link' | 'other';
  title: string;
  organization: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface Resume {
  id: string;
  user_id: string;
  bucket_id: string;
  storage_path: string;
  original_filename: string;
  title: string | null;
  mime_type: string;
  size_bytes: number;
  is_default: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobPost {
  id: string;
  company_id: string;
  created_by_user_id: string;
  title: string;
  description: string;
  requirements: string | null;
  benefits: string | null;
  location: string | null;
  employment_type: EmploymentType;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  status: JobPostStatus;
  published_at: string | null;
  deadline_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  company?: Company; // Joined company info
}

export interface SavedJob {
  id: string;
  user_id: string;
  job_post_id: string;
  created_at: string;
  job_post?: JobPost;
}

export interface Application {
  id: string;
  job_post_id: string;
  applicant_user_id: string;
  resume_id: string;
  cover_letter: string | null;
  current_status: ApplicationStatus;
  applied_at: string;
  reviewed_at: string | null;
  withdrawn_at: string | null;
  resume_title_snapshot: string | null;
  resume_storage_path_snapshot: string | null;
  resume_original_filename_snapshot: string | null;
  resume_mime_type_snapshot: string | null;
  resume_size_bytes_snapshot: number | null;
  created_at: string;
  updated_at: string;
  job_post?: JobPost; // Joined job post info
}

export interface ApplicationStage {
  id: string;
  application_id: string;
  changed_by_user_id: string;
  stage: ApplicationStatus;
  note: string | null;
  is_system_generated: boolean;
  created_at: string;
}

export interface RecruiterRegistrationForm {
  id: string;
  user_id: string;
  company_name: string;
  company_email: string | null;
  company_website_url: string | null;
  business_license_storage_path: string | null;
  status: RecruiterRegistrationStatus;
  admin_note: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  profile?: Profile; // Joined creator profile
  reviewer_profile?: Profile; // Joined reviewer profile
}
