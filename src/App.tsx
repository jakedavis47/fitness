import { Route, Routes } from 'react-router-dom'
import Today from './pages/Today'
import ActiveWorkout from './pages/ActiveWorkout'
import History from './pages/History'
import WorkoutDetail from './pages/WorkoutDetail'
import Progress from './pages/Progress'
import Routines from './pages/Routines'
import RoutineEdit from './pages/RoutineEdit'
import BottomNavigation from './components/BottomNavigation'

function App() {
  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-neutral-100">
      <main className="flex-1 overflow-y-auto pb-[calc(104px+env(safe-area-inset-bottom))]">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/workout/:id" element={<ActiveWorkout />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:id" element={<WorkoutDetail />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/routines/new" element={<RoutineEdit />} />
          <Route path="/routines/:id" element={<RoutineEdit />} />
        </Routes>
      </main>
      <BottomNavigation />
    </div>
  )
}

export default App
