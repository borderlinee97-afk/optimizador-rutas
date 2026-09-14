import {
  Router,
} from 'express'

import mobileExtraStopsRouter
  from './mobile.extraStops.route.js'

import mobileVisitGeofenceRouter
  from './mobile.visitGeofence.route.js'

import mobileFarmaciasRouter
  from './mobile.farmacias.route.js'

import mobilePlacesRouter
  from './mobile.places.route.js'

import mobileWorkPlansRouter
  from './mobile.workPlans.route.js'

import mobileWorkPlanCatalogRouter
  from './mobile.workPlanCatalog.route.js'

import mobileWorkPlanItemsRouter
  from './mobile.workPlanItems.route.js'

import mobileWorkPlanApprovalActionsRouter
  from './mobile.workPlanApprovalActions.route.js'

import mobileWorkPlanCancellationActionsRouter
  from './mobile.workPlanCancellationActions.route.js'

import mobileWorkPlanApprovalsRouter
  from './mobile.workPlanApprovals.route.js'

const router =
  Router()

router.get(
  '/ping',
  (
    req,
    res,
  ) => {
    return res.json({
      ok:
        true,

      service:
        'mobile-api',
    })
  },
)

router.use(
  '/places',
  mobilePlacesRouter,
)

router.use(
  '/work-plans/catalog',
  mobileWorkPlanCatalogRouter,
)

/*
 * Acciones compartidas de aprobaciÃ³n
 * de planes.
 */
router.use(
  '/work-plans/approvals',
  mobileWorkPlanApprovalActionsRouter,
)

/*
 * Acciones compartidas de aprobaciÃ³n
 * de cancelaciones.
 */
router.use(
  '/work-plans/approvals',
  mobileWorkPlanCancellationActionsRouter,
)

/*
 * Consultas histÃ³ricas / bandeja mÃ³vil.
 *
 * Sus handlers antiguos de aprobar/rechazar
 * permanecen por compatibilidad, pero las
 * rutas anteriores interceptan las acciones
 * antes de llegar aquÃ­.
 */
router.use(
  '/work-plans/approvals',
  mobileWorkPlanApprovalsRouter,
)

router.use(
  '/work-plans',
  mobileWorkPlanItemsRouter,
)

router.use(
  '/work-plans',
  mobileWorkPlansRouter,
)

router.use(
  '/farmacias/extra-stops',
  mobileExtraStopsRouter,
)

router.use(
  '/farmacias',
  mobileVisitGeofenceRouter,
)

router.use(
  '/farmacias',
  mobileFarmaciasRouter,
)

export default router
