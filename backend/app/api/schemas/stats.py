# Schema định nghĩa cấu trúc dữ liệu trả về cho thống kê Landing Page
from pydantic import BaseModel, Field


class LandingStatsResponse(BaseModel):
    # Số lượng tin tuyển dụng đang mở
    jobs_count: int = Field(default=0, description="Số lượng tin tuyển dụng đang mở")
    # Số lượng ứng viên đã đăng ký
    candidates_count: int = Field(default=0, description="Số lượng ứng viên đã đăng ký")
    # Số lượng công ty đối tác
    companies_count: int = Field(default=0, description="Số lượng công ty đối tác")
    # Tỷ lệ tuyển dụng thành công (%)
    success_rate: int = Field(default=0, description="Tỷ lệ tuyển dụng thành công (%)")
    # Tổng số đơn ứng tuyển
    total_applications: int = Field(default=0, description="Tổng số đơn ứng tuyển")
    # Số đơn ứng tuyển thành công (offer/accepted)
    successful_applications: int = Field(default=0, description="Số đơn ứng tuyển thành công")
