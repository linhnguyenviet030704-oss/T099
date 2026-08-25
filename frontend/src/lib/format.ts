/**
 * Formats a numeric amount to a structured currency string.
 * Defaults to VND with Vietnamese locale format.
 */
export function formatCurrency(amount: number | null | undefined, currency: string = 'VND'): string {
  if (amount === null || amount === undefined) return 'Thỏa thuận';
  
  try {
    const code = (currency || 'VND').toUpperCase();
    if (code === 'VND') {
      return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        maximumFractionDigits: 0,
      }).format(amount);
    }
    
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: code,
    }).format(amount);
  } catch (error) {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

/**
 * Formats an ISO string or Date to dd/MM/yyyy HH:mm or dd/MM/yyyy depending on the presence of time
 */
export function formatDate(dateString: string | null | undefined, includeTime = false): string {
  if (!dateString) return 'Chưa xác định';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Sai định dạng';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    if (includeTime) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }
    
    return `${day}/${month}/${year}`;
  } catch (error) {
    return dateString;
  }
}

/**
 * Friendly translation labels for various enums
 */
export const ENUM_LABELS = {
  profile_role: {
    candidate: 'Ứng viên',
    recruiter: 'Nhà tuyển dụng',
    admin: 'Quản trị viên',
  },
  company_verification_status: {
    pending: 'Đang chờ duyệt',
    verified: 'Đã xác thực',
    rejected: 'Đã từ chối',
  },
  job_post_status: {
    draft: 'Bản nháp',
    published: 'Đang tuyển',
    closed: 'Đã đóng',
    archived: 'Lưu trữ',
  },
  employment_type: {
    full_time: 'Toàn thời gian',
    part_time: 'Bán thời gian',
    internship: 'Thực tập',
    contract: 'Hợp đồng',
    remote: 'Làm việc từ xa',
    hybrid: 'Linh hoạt (Hybrid)',
  },
  application_status: {
    pending: 'Đã nộp đơn',
    screening: 'Đang duyệt hồ sơ',
    interview: 'Lên lịch phỏng vấn',
    offer: 'Nhận thư mời (Offer)',
    accepted: 'Đồng ý nhận việc',
    rejected: 'Hồ sơ chưa phù hợp',
    withdrawn: 'Đã rút đơn',
  },
  recruiter_registration_status: {
    pending: 'Chờ duyệt',
    approved: 'Đã phê duyệt',
    rejected: 'Đã từ chối',
  },
  line_type: {
    summary: 'Giới thiệu bản thân',
    experience: 'Kinh nghiệm làm việc',
    education: 'Trình độ học vấn',
    skill: 'Kỹ năng',
    project: 'Dự án',
    certification: 'Chứng chỉ',
    language: 'Ngoại ngữ',
    link: 'Liên kết',
    other: 'Thông tin bổ sung',
  },
};

export const ENUM_LABELS_EN = {
  profile_role: {
    candidate: 'Candidate',
    recruiter: 'Recruiter',
    admin: 'Administrator',
  },
  company_verification_status: {
    pending: 'Pending Review',
    verified: 'Verified',
    rejected: 'Rejected',
  },
  job_post_status: {
    draft: 'Draft',
    published: 'Hiring',
    closed: 'Closed',
    archived: 'Archived',
  },
  employment_type: {
    full_time: 'Full-time',
    part_time: 'Part-time',
    internship: 'Internship',
    contract: 'Contract',
    remote: 'Remote',
    hybrid: 'Hybrid',
  },
  application_status: {
    pending: 'Submitted',
    screening: 'Screening',
    interview: 'Interviewing',
    offer: 'Offer Extended',
    accepted: 'Accepted',
    rejected: 'Not Selected',
    withdrawn: 'Withdrawn',
  },
  recruiter_registration_status: {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
  },
  line_type: {
    summary: 'Summary',
    experience: 'Work Experience',
    education: 'Education',
    skill: 'Skills',
    project: 'Projects',
    certification: 'Certifications',
    language: 'Languages',
    link: 'Links',
    other: 'Additional Information',
  },
};

export function getEnumLabels(lang: 'vi' | 'en' = 'vi') {
  return lang === 'en' ? ENUM_LABELS_EN : ENUM_LABELS;
}

export function getLineTypeLabelFormatted(type: string, lang: 'vi' | 'en' = 'vi'): string {
  const dict = lang === 'en' ? ENUM_LABELS_EN.line_type : ENUM_LABELS.line_type;
  return (dict as Record<string, string>)[type] || type;
}

