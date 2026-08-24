import { AnimatePresence, motion } from "framer-motion";
import CosmicBackdrop from "../components/CosmicBackdrop.tsx";
import Hud from "../components/Hud.tsx";
import SparkleCursor from "../components/SparkleCursor.tsx";
import { useClusterSession, useEngineSocket } from "../hooks/useClusterSession.ts";
import JoinGate from "../play/JoinGate.tsx";
import PhaseView from "../play/PhaseView.tsx";

export default function PlayPage() {
  const socket = useEngineSocket();
  const session = useClusterSession(socket);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <CosmicBackdrop />
      <SparkleCursor />
      <div className="relative z-10 mx-auto min-h-dvh w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {!session.view ? (
          session.resuming ? (
            <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
              <div className="orig-radar mb-4" aria-hidden />
              <p className="text-[11px] font-bold uppercase tracking-[0.38em] text-cyan-200/80">
                Coding Club · RVCE
              </p>
              <h1 className="font-display mt-4 text-4xl font-bold">Rejoining your node</h1>
              <p className="mt-3 max-w-xs text-sm leading-relaxed text-cream/60">
                Restoring cluster {session.lastCluster ?? ""} from this phone.
              </p>
            </div>
          ) : (
            <JoinGate
              busy={session.busy}
              error={session.joinError}
              lastCluster={session.lastCluster}
              connected={session.connected}
              clusterCount={session.clusterCount}
              onJoin={(n, team) => session.join(n, team)}
            />
          )
        ) : (
          <>
            <Hud view={session.view} connected={session.connected} />
            <AnimatePresence mode="wait">
              <motion.div
                key={session.view.snapshot.phase + String(session.view.snapshot.questionIndex)}
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.98 }}
                transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <PhaseView
                  view={session.view}
                  onVote={(optionId, wager) => {
                    const q = session.view?.snapshot.question;
                    if (!q) return;
                    session.submitVote(q.id, optionId, wager);
                  }}
                  onClaim={session.claimPower}
                />
              </motion.div>
            </AnimatePresence>
          </>
        )}

        {session.banner && (
          <button
            type="button"
            className="animate-pop fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 rounded-2xl bg-[#1a1020]/95 px-4 py-3 text-left text-sm text-cream ring-1 ring-magenta/40"
            onClick={() => session.setBanner(null)}
          >
            {session.banner}
            <span className="mt-1 block text-[10px] uppercase tracking-widest text-cream/40">
              Tap to dismiss
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
