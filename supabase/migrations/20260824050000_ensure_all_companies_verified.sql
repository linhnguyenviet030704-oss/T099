-- Migration: Ensure all existing companies are marked as verified so job posts can be published and viewed on /jobs
update public.companies
set verification_status = 'verified'
where verification_status is null or verification_status <> 'verified';
