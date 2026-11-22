import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Workout } from './pages/Workout'
import { History } from './pages/History'
import { SessionDetail } from './pages/SessionDetail'
import { Library } from './pages/Library'
import { ExerciseDetail } from './pages/ExerciseDetail'
import { RoutineEdit } from './pages/RoutineEdit'
import { PlanEdit } from './pages/PlanEdit'
import { PlanDetail } from './pages/PlanDetail'
import { Settings } from './pages/Settings'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="workout" element={<Workout />} />
          <Route path="history" element={<History />} />
          <Route path="history/:id" element={<SessionDetail />} />
          <Route path="library" element={<Library />} />
          <Route path="library/:tab" element={<Library />} />
          <Route path="exercises/:id" element={<ExerciseDetail />} />
          <Route path="routines/new" element={<RoutineEdit />} />
          <Route path="routines/:id/edit" element={<RoutineEdit />} />
          <Route path="plans/new" element={<PlanEdit />} />
          <Route path="plans/:id" element={<PlanDetail />} />
          <Route path="plans/:id/edit" element={<PlanEdit />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
