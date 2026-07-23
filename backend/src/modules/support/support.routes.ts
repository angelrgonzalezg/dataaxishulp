import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { successResponse } from '../../types/api.types';
import { ValidationError } from '../../utils/AppError';
import { DEFAULT_SYSTEM_KEY } from './support.frames';
import {
  lookupOrderById,
  lookupOrderByKenmerk,
  lookupOrderByRegisterTitle,
} from './support.service';
import { lookupParcel } from './support.parcel.service';
import { lookupDeedHistoryByTitle } from './support.deed.service';
import { buildObjectInzage } from './inzage.service';
import { buildSubjectInzage } from './inzage.subject.service';
import type { InzageObjectVariant, InzageSubjectVariant } from './inzage.types';

const router = Router();

const objectVariants: InzageObjectVariant[] = ['object', 'object_beperkt', 'her', 'na'];
const subjectVariants: InzageSubjectVariant[] = ['subject', 'negatief'];

const subjectParamsSchema = z.object({
  subjectId: z.coerce.number().int().positive(),
});

const systemKeySchema = z.object({
  systemKey: z.string().min(1).optional(),
});

const orderParamsSchema = z.object({
  orderId: z.coerce.number().int().positive(),
});

const parcelParamsSchema = z.object({
  parcelId: z.coerce.number().int().positive(),
});

const parcelQuerySchema = z.object({
  meetBrief: z.string().min(1).optional(),
  parcelId: z.coerce.number().int().positive().optional(),
  systemKey: z.string().min(1).optional(),
});

router.get(
  '/orders/:orderId',
  requirePermission('support.view'),
  validate(orderParamsSchema, 'params'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const data = await lookupOrderById(Number(req.params.orderId), systemKey);
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/orders',
  requirePermission('support.view'),
  async (req, res, next) => {
    try {
      const kenmerk = typeof req.query.kenmerk === 'string' ? req.query.kenmerk.trim() : '';
      const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
      const systemKey =
        (typeof req.query.systemKey === 'string' ? req.query.systemKey.trim() : '') ||
        DEFAULT_SYSTEM_KEY;

      if (kenmerk) {
        const data = await lookupOrderByKenmerk(kenmerk, systemKey);
        res.json(successResponse(data));
        return;
      }

      if (title) {
        const data = await lookupOrderByRegisterTitle(title, systemKey);
        res.json(successResponse(data));
        return;
      }

      throw new ValidationError('Provide kenmerk or title (Register-Deel-Nummer)');
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/parcels/:parcelId',
  requirePermission('support.view'),
  validate(parcelParamsSchema, 'params'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const data = await lookupParcel({
        parcelId: Number(req.params.parcelId),
        systemKey,
      });
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/parcels',
  requirePermission('support.view'),
  validate(parcelQuerySchema, 'query'),
  async (req, res, next) => {
    try {
      const query = req.query as z.infer<typeof parcelQuerySchema>;
      if (!query.parcelId && !query.meetBrief) {
        throw new ValidationError('Provide parcelId or meetBrief');
      }
      const data = await lookupParcel({
        parcelId: query.parcelId,
        meetBrief: query.meetBrief,
        systemKey: query.systemKey,
      });
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/inzage/parcel/:parcelId',
  requirePermission('support.view'),
  validate(parcelParamsSchema, 'params'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const requested = (req.query.variant as string | undefined)?.trim() as
        | InzageObjectVariant
        | undefined;
      const variant = objectVariants.includes(requested as InzageObjectVariant)
        ? (requested as InzageObjectVariant)
        : 'object';
      const data = await buildObjectInzage({
        parcelId: Number(req.params.parcelId),
        systemKey,
        variant,
      });
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/inzage/subject/:subjectId',
  requirePermission('support.view'),
  validate(subjectParamsSchema, 'params'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const requested = (req.query.variant as string | undefined)?.trim() as
        | InzageSubjectVariant
        | undefined;
      const variant = subjectVariants.includes(requested as InzageSubjectVariant)
        ? (requested as InzageSubjectVariant)
        : 'subject';
      const data = await buildSubjectInzage({
        subjectId: Number(req.params.subjectId),
        systemKey,
        variant,
      });
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/deeds/history',
  requirePermission('support.view'),
  async (req, res, next) => {
    try {
      const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
      const systemKey =
        (typeof req.query.systemKey === 'string' ? req.query.systemKey.trim() : '') ||
        DEFAULT_SYSTEM_KEY;

      if (!title) {
        throw new ValidationError('Provide title (Register-Deel-Nummer, e.g. C 23-92)');
      }

      const data = await lookupDeedHistoryByTitle(title, systemKey);
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

export default router;
