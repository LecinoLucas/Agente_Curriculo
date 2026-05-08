export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type JobStatusSummary = {
  all: number;
  published: number;
  draft: number;
  paused: number;
  closed: number;
  cancelled: number;
  attention: number;
};

export type PaginatedJobs<T> = Paginated<T> & {
  summary: JobStatusSummary;
};
