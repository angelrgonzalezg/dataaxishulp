import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { successResponse } from '../../types/api.types';
import { ValidationError } from '../../utils/AppError';
import { DEFAULT_SYSTEM_KEY, resolveSystemDialect } from './support.frames';
import {
  lookupOrderById,
  lookupOrderByKenmerk,
  lookupOrderByRegisterTitle,
} from './support.service';
import { lookupParcel } from './support.parcel.service';
import { lookupDeedHistoryByTitle } from './support.deed.service';
import {
  getDeedLegalFact,
  listLegalFacts,
  updateDeedLegalFact,
} from './support.deed.mutate.service';
import {
  changeDeedNotary,
  getDeedNotary,
  searchNotaries,
} from './support.deed.notary.service';
import { updateFrameRows } from './support.frame.edit.service';
import { reopenBestelling } from './support.order.reopen.service';
import { voidOrder } from './support.order.void.service';
import {
  changeOrderParcel,
  listOrderParcelLinks,
  resolveParcelByEsri,
} from './support.order.change.parcel.service';
import {
  changeOrderDeed,
  listOrderDeedLinks,
  resolveDeedByTitle,
} from './support.order.change.deed.service';
import { correctRegisterTitle } from './support.deed.renumber.service';
import { verifyOrder } from './support.order.verify.service';
import {
  lookupRetireSubjectCandidates,
  retireSubjectFromDeed,
  correctOwnershipShare,
} from './support.retire.subject.service';
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

const deedParamsSchema = z.object({
  deedId: z.coerce.number().int().positive(),
});

const updateDeedLegalFactSchema = z.object({
  systemKey: z.string().min(1),
  legalFactId: z.coerce.number().int().positive(),
  confirm: z.literal(true),
});

const notarySearchSchema = z.object({
  systemKey: z.string().min(1).optional(),
  q: z.string().min(1),
});

const changeDeedNotarySchema = z.object({
  systemKey: z.string().min(1),
  notaryId: z.coerce.number().int().positive(),
  previewOnly: z.boolean(),
  confirm: z.literal(true).optional(),
});

const updateFrameRowsSchema = z.object({
  systemKey: z.string().min(1),
  tableName: z.string().min(1),
  primaryKey: z.string().min(1),
  previewOnly: z.boolean(),
  confirm: z.literal(true).optional(),
  changes: z
    .array(
      z.object({
        primary_key_value: z.union([z.string(), z.number()]),
        cells: z
          .array(
            z.object({
              column: z.string().min(1),
              from: z.unknown().nullable(),
              to: z.unknown().nullable(),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

const reopenBestellingSchema = z.object({
  systemKey: z.string().min(1),
  previewOnly: z.boolean(),
  confirm: z.literal(true).optional(),
});

const voidOrderSchema = z.object({
  systemKey: z.string().min(1),
  previewOnly: z.boolean(),
  confirm: z.literal(true).optional(),
  acknowledgeRisk: z.boolean().optional(),
});

const changeOrderParcelSchema = z.object({
  systemKey: z.string().min(1),
  linkId: z.coerce.number().int().positive(),
  newParcelEsri: z.string().min(1).optional(),
  newParcelId: z.coerce.number().int().positive().optional(),
  previewOnly: z.boolean(),
  confirm: z.literal(true).optional(),
});

const changeOrderDeedSchema = z.object({
  systemKey: z.string().min(1),
  linkId: z.coerce.number().int().positive(),
  newRegisterTitle: z.string().min(1).optional(),
  newDeedId: z.coerce.number().int().positive().optional(),
  previewOnly: z.boolean(),
  confirm: z.literal(true).optional(),
});

const parcelEsriSearchSchema = z.object({
  systemKey: z.string().min(1).optional(),
  esri: z.string().min(1),
});

const deedTitleSearchSchema = z.object({
  systemKey: z.string().min(1).optional(),
  title: z.string().min(1),
});

const correctRegisterTitleSchema = z.object({
  systemKey: z.string().min(1),
  fromTitle: z.string().min(1),
  toTitle: z.string().min(1),
  fromDeedId: z.coerce.number().int().positive().optional(),
  previewOnly: z.boolean(),
  confirm: z.literal(true).optional(),
});

const retireSubjectLookupSchema = z.object({
  systemKey: z.string().min(1).optional(),
  registerTitle: z.string().min(1),
  parcelEsri: z.string().min(1),
});

const retireSubjectSchema = z.object({
  systemKey: z.string().min(1),
  deedDetailIds: z.array(z.coerce.number().int().positive()).min(1),
  previewOnly: z.boolean(),
  confirm: z.literal(true).optional(),
});

const correctOwnershipShareSchema = z.object({
  systemKey: z.string().min(1),
  shareNumerator: z.coerce.number().int().nonnegative(),
  shareDenominator: z.coerce.number().int().positive(),
  previewOnly: z.boolean(),
  confirm: z.literal(true).optional(),
  contextCandidates: z
    .array(
      z.object({
        deed_detail_id: z.number().int().positive(),
        deed_id: z.number().int(),
        register_title: z.string(),
        parcel_id: z.number().int(),
        parcel_esri: z.string().nullable(),
        subject_id: z.number().int(),
        subject_name: z.string(),
        share_numerator: z.number().nullable(),
        share_denominator: z.number().nullable(),
        is_retired: z.boolean(),
        legal_fact_type_id: z.number().nullable(),
      }),
    )
    .optional(),
});

const deedDetailParamsSchema = z.object({
  deedDetailId: z.coerce.number().int().positive(),
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
  '/parcels/search-esri',
  requirePermission('support.view'),
  validate(parcelEsriSearchSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof parcelEsriSearchSchema>;
      const systemKey = query.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
      const dialect = await resolveSystemDialect(systemKey);
      const data = await resolveParcelByEsri(systemKey, dialect, query.esri);
      res.json(successResponse(data));
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

router.get(
  '/legal-facts',
  requirePermission('support.view'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const data = await listLegalFacts(systemKey);
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/deeds/:deedId/legal-fact',
  requirePermission('support.view'),
  validate(deedParamsSchema, 'params'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const data = await getDeedLegalFact(Number(req.params.deedId), systemKey);
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/deeds/:deedId/legal-fact',
  requirePermission('support.edit'),
  validate(deedParamsSchema, 'params'),
  validate(updateDeedLegalFactSchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof updateDeedLegalFactSchema>;
      const data = await updateDeedLegalFact({
        deedId: Number(req.params.deedId),
        systemKey: body.systemKey,
        legalFactId: body.legalFactId,
        confirm: body.confirm,
        updatedBy: req.user?.username ?? 'dataaxis-hulp',
      });
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/notaries/search',
  requirePermission('support.view'),
  validate(notarySearchSchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const q = String(req.query.q ?? '');
      const data = await searchNotaries(q, systemKey);
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/deeds/:deedId/notary',
  requirePermission('support.view'),
  validate(deedParamsSchema, 'params'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const data = await getDeedNotary(Number(req.params.deedId), systemKey);
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/deeds/:deedId/notary',
  requirePermission('support.edit'),
  validate(deedParamsSchema, 'params'),
  validate(changeDeedNotarySchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof changeDeedNotarySchema>;
      if (!body.previewOnly && body.confirm !== true) {
        throw new ValidationError(
          'Confirmation required. Set confirm=true to apply Change Notaris.',
        );
      }
      const data = await changeDeedNotary({
        deedId: Number(req.params.deedId),
        systemKey: body.systemKey,
        notaryId: body.notaryId,
        previewOnly: body.previewOnly,
        confirm: body.confirm,
        updatedBy: req.user?.username ?? 'dataaxis-hulp',
      });
      res.json(
        successResponse(
          data,
          body.previewOnly ? 'Change Notaris preview' : 'Deed notary updated',
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/frames/update-rows',
  requirePermission('support.edit'),
  validate(updateFrameRowsSchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof updateFrameRowsSchema>;
      if (!body.previewOnly && body.confirm !== true) {
        throw new ValidationError(
          'Confirmation required. Set confirm=true to apply frame column updates.',
        );
      }
      const data = await updateFrameRows({
        systemKey: body.systemKey,
        tableName: body.tableName,
        primaryKey: body.primaryKey,
        changes: body.changes.map((row) => ({
          primary_key_value: row.primary_key_value,
          cells: row.cells.map((cell) => ({
            column: cell.column,
            from: cell.from ?? null,
            to: cell.to ?? null,
          })),
        })),
        previewOnly: body.previewOnly,
        confirm: body.confirm,
      });
      res.json(
        successResponse(
          data,
          body.previewOnly ? 'Frame column update preview' : 'Frame columns updated',
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/orders/:orderId/reopen-bestelling',
  requirePermission('support.edit'),
  validate(orderParamsSchema, 'params'),
  validate(reopenBestellingSchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof reopenBestellingSchema>;
      if (!body.previewOnly && body.confirm !== true) {
        throw new ValidationError(
          'Confirmation required. Set confirm=true to apply Reopen Bestelling.',
        );
      }
      const data = await reopenBestelling({
        orderId: Number(req.params.orderId),
        systemKey: body.systemKey,
        previewOnly: body.previewOnly,
        confirm: body.confirm,
      });
      res.json(
        successResponse(
          data,
          body.previewOnly ? 'Reopen Bestelling preview' : 'Reopen Bestelling applied',
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/orders/:orderId/void',
  requirePermission('support.edit'),
  validate(orderParamsSchema, 'params'),
  validate(voidOrderSchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof voidOrderSchema>;
      if (!body.previewOnly && body.confirm !== true) {
        throw new ValidationError(
          'Confirmation required. Set confirm=true to void the order.',
        );
      }
      const data = await voidOrder({
        orderId: Number(req.params.orderId),
        systemKey: body.systemKey,
        previewOnly: body.previewOnly,
        confirm: body.confirm,
        acknowledgeRisk: body.acknowledgeRisk,
        updatedBy: req.user?.username ?? 'dataaxis-hulp',
      });
      res.json(
        successResponse(
          data,
          body.previewOnly ? 'Void order preview' : 'Order voided',
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/orders/:orderId/parcel-links',
  requirePermission('support.view'),
  validate(orderParamsSchema, 'params'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const data = await listOrderParcelLinks({
        orderId: Number(req.params.orderId),
        systemKey,
      });
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/orders/:orderId/change-parcel',
  requirePermission('support.edit'),
  validate(orderParamsSchema, 'params'),
  validate(changeOrderParcelSchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof changeOrderParcelSchema>;
      if (!body.previewOnly && body.confirm !== true) {
        throw new ValidationError(
          'Confirmation required. Set confirm=true to change the parcel on this order.',
        );
      }
      if (!body.newParcelEsri && !body.newParcelId) {
        throw new ValidationError('Provide newParcelEsri or newParcelId');
      }
      const data = await changeOrderParcel({
        orderId: Number(req.params.orderId),
        systemKey: body.systemKey,
        linkId: body.linkId,
        newParcelEsri: body.newParcelEsri,
        newParcelId: body.newParcelId,
        previewOnly: body.previewOnly,
        confirm: body.confirm,
        updatedBy: req.user?.username ?? 'dataaxis-hulp',
      });
      res.json(
        successResponse(
          data,
          body.previewOnly ? 'Change parcel preview' : 'Order parcel updated',
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/orders/:orderId/deed-links',
  requirePermission('support.view'),
  validate(orderParamsSchema, 'params'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const data = await listOrderDeedLinks({
        orderId: Number(req.params.orderId),
        systemKey,
      });
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/orders/:orderId/verify',
  requirePermission('support.view'),
  validate(orderParamsSchema, 'params'),
  validate(systemKeySchema, 'query'),
  async (req, res, next) => {
    try {
      const systemKey =
        (req.query.systemKey as string | undefined)?.trim() || DEFAULT_SYSTEM_KEY;
      const data = await verifyOrder({
        orderId: Number(req.params.orderId),
        systemKey,
      });
      res.json(successResponse(data, 'Order verification'));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/deeds/correct-register-title',
  requirePermission('support.edit'),
  validate(correctRegisterTitleSchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof correctRegisterTitleSchema>;
      if (!body.previewOnly && body.confirm !== true) {
        throw new ValidationError(
          'Confirmation required. Set confirm=true to correct the Register-Deel-Nummer.',
        );
      }
      const data = await correctRegisterTitle({
        systemKey: body.systemKey,
        fromTitle: body.fromTitle,
        toTitle: body.toTitle,
        fromDeedId: body.fromDeedId,
        previewOnly: body.previewOnly,
        confirm: body.confirm,
        updatedBy: req.user?.username ?? 'dataaxis-hulp',
      });
      res.json(
        successResponse(
          data,
          body.previewOnly
            ? 'Correct Register-Deel-Nummer preview'
            : 'Register-Deel-Nummer updated',
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/deeds/search-title',
  requirePermission('support.view'),
  validate(deedTitleSearchSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof deedTitleSearchSchema>;
      const systemKey = query.systemKey?.trim() || DEFAULT_SYSTEM_KEY;
      const dialect = await resolveSystemDialect(systemKey);
      const data = await resolveDeedByTitle(systemKey, dialect, query.title);
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/orders/:orderId/change-deed',
  requirePermission('support.edit'),
  validate(orderParamsSchema, 'params'),
  validate(changeOrderDeedSchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof changeOrderDeedSchema>;
      if (!body.previewOnly && body.confirm !== true) {
        throw new ValidationError(
          'Confirmation required. Set confirm=true to change the deed on this order.',
        );
      }
      if (!body.newRegisterTitle && !body.newDeedId) {
        throw new ValidationError('Provide newRegisterTitle or newDeedId');
      }
      const data = await changeOrderDeed({
        orderId: Number(req.params.orderId),
        systemKey: body.systemKey,
        linkId: body.linkId,
        newRegisterTitle: body.newRegisterTitle,
        newDeedId: body.newDeedId,
        previewOnly: body.previewOnly,
        confirm: body.confirm,
        updatedBy: req.user?.username ?? 'dataaxis-hulp',
      });
      res.json(
        successResponse(
          data,
          body.previewOnly ? 'Change deed preview' : 'Order deed updated',
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/deed-details/retire-subject',
  requirePermission('support.view'),
  validate(retireSubjectLookupSchema, 'query'),
  async (req, res, next) => {
    try {
      const query = req.query as unknown as z.infer<typeof retireSubjectLookupSchema>;
      const data = await lookupRetireSubjectCandidates({
        systemKey: query.systemKey,
        registerTitle: query.registerTitle,
        parcelEsri: query.parcelEsri,
      });
      res.json(successResponse(data));
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/deed-details/retire-subject',
  requirePermission('support.edit'),
  validate(retireSubjectSchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof retireSubjectSchema>;
      if (!body.previewOnly && body.confirm !== true) {
        throw new ValidationError(
          'Confirmation required. Set confirm=true to retire the selected subject row(s).',
        );
      }
      const data = await retireSubjectFromDeed({
        systemKey: body.systemKey,
        deedDetailIds: body.deedDetailIds,
        previewOnly: body.previewOnly,
        confirm: body.confirm,
        updatedBy: req.user?.username ?? 'dataaxis-hulp',
      });
      res.json(
        successResponse(
          data,
          body.previewOnly ? 'Retire subject preview' : 'Subject retired from deed',
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/deed-details/:deedDetailId/share',
  requirePermission('support.edit'),
  validate(deedDetailParamsSchema, 'params'),
  validate(correctOwnershipShareSchema, 'body'),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof correctOwnershipShareSchema>;
      if (!body.previewOnly && body.confirm !== true) {
        throw new ValidationError(
          'Confirmation required. Set confirm=true to update the ownership share.',
        );
      }
      const data = await correctOwnershipShare({
        systemKey: body.systemKey,
        deedDetailId: Number(req.params.deedDetailId),
        shareNumerator: body.shareNumerator,
        shareDenominator: body.shareDenominator,
        previewOnly: body.previewOnly,
        confirm: body.confirm,
        updatedBy: req.user?.username ?? 'dataaxis-hulp',
        contextCandidates: body.contextCandidates,
      });
      res.json(
        successResponse(
          data,
          body.previewOnly ? 'Ownership share preview' : 'Ownership share updated',
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

export default router;
