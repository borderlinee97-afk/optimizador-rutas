import {
  createRouter,
  createWebHistory,
} from 'vue-router'

import MapPage
  from '../components/MapPage.vue'

import WorkPlansView
  from '../views/farmacias/WorkPlansView.vue'

import WorkPlanDetailView
  from '../views/farmacias/WorkPlanDetailView.vue'

import ApprovalsView
  from '../views/farmacias/ApprovalsView.vue'

import AssignmentsView
  from '../views/farmacias/AssignmentsView.vue'

import PersonasView
  from '../views/farmacias/PersonasView.vue'
import SupervisorTerritorialView from '../views/farmacias/SupervisorTerritorialView.vue'

const router =
  createRouter({
    history:
      createWebHistory(),

    routes: [
      {
        path: '/farmacias/ruta-territorial',
        name: 'farmacias-ruta-territorial',
        component: SupervisorTerritorialView,
        meta: { area: 'FARMACIAS', roles: ['GERENTE', 'COORDINADOR', 'SUPERVISOR'] },
      },
      {
        path:
          '/',

        redirect:
          '/farmacias/mapa',
      },

      // =====================================================
      // FARMACIAS · MAPA
      // =====================================================

      {
        path:
          '/farmacias/mapa',

        name:
          'farmacias-mapa',

        component:
          MapPage,

        meta: {
          area:
            'FARMACIAS',

          roles: [
            'GERENTE',
            'COORDINADOR',
            'SUPERVISOR',
          ],
        },
      },

      // =====================================================
      // FARMACIAS · PLANES
      // =====================================================

      {
        path:
          '/farmacias/planes',

        name:
          'farmacias-planes',

        component:
          WorkPlansView,

        meta: {
          area:
            'FARMACIAS',

          roles: [
            'GERENTE',
            'COORDINADOR',
            'SUPERVISOR',
          ],
        },
      },

      {
        path:
          '/farmacias/planes/:planId',

        name:
          'farmacias-plan-detail',

        component:
          WorkPlanDetailView,

        meta: {
          area:
            'FARMACIAS',

          roles: [
            'GERENTE',
            'COORDINADOR',
            'SUPERVISOR',
          ],
        },
      },

      // =====================================================
      // FARMACIAS · APROBACIONES
      // =====================================================

      {
        path:
          '/farmacias/aprobaciones',

        name:
          'farmacias-aprobaciones',

        component:
          ApprovalsView,

        meta: {
          area:
            'FARMACIAS',

          roles: [
            'GERENTE',
            'COORDINADOR',
          ],
        },
      },

      // =====================================================
      // FARMACIAS · ASIGNACIONES
      // =====================================================

      {
        path:
          '/farmacias/asignaciones',

        name:
          'farmacias-asignaciones',

        component:
          AssignmentsView,

        meta: {
          area:
            'FARMACIAS',

          roles: [
            'GERENTE',
            'COORDINADOR',
          ],
        },
      },

      // =====================================================
      // FARMACIAS · PERSONAS
      // =====================================================

      {
        path:
          '/farmacias/personas',

        name:
          'farmacias-personas',

        component:
          PersonasView,

        meta: {
          area:
            'FARMACIAS',

          roles: [
            'GERENTE',
            'COORDINADOR',
          ],
        },
      },

      // =====================================================
      // OPERACIONES
      // =====================================================

      {
        path:
          '/operaciones/mapa',

        name:
          'operaciones-mapa',

        component:
          MapPage,

        meta: {
          area:
            'OPERACIONES',
        },
      },

      // =====================================================
      // FALLBACK
      // =====================================================

      {
        path:
          '/:pathMatch(.*)*',

        redirect:
          '/',
      },
    ],
  })

export default router
