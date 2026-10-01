import { z } from 'zod';

const competitorSchema = z.object({
  homeAway: z.enum(['home', 'away']),
  score: z.string().optional(),
  team: z.object({
    displayName: z.string(),
    abbreviation: z.string(),
  }),
});

const competitionSchema = z.object({
  competitors: z.array(competitorSchema).length(2),
  status: z.object({
    type: z.object({
      state: z.enum(['pre', 'in', 'post']),
      completed: z.boolean(),
      name: z.string().optional(),
    }),
  }),
});

const eventSchema = z.object({
  id: z.string(),
  date: z.string(),
  competitions: z.array(competitionSchema).min(1),
});

export const scoreboardSchema = z.object({
  events: z.array(eventSchema),
});

export type EspnScoreboard = z.infer<typeof scoreboardSchema>;
