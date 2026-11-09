import { z } from 'zod';
import { queryDate } from '../../common/query/list-query';

/** Inclusive calendar dates (YYYY-MM-DD) in the business timezone; default: current month. */
export const dashboardQuerySchema = z
  .object({
    from: queryDate.transform((v) => v?.slice(0, 10)),
    to: queryDate.transform((v) => v?.slice(0, 10)),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
