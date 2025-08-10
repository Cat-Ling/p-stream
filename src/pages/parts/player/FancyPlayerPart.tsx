import { ReactNode, useEffect, useRef, useState } from "react";

import {
  getEpisodes,
  getMediaDetails,
  getMediaLogo,
} from "@/backend/metadata/tmdb";
import { TMDBContentTypes } from "@/backend/metadata/types/tmdb";
import IosPwaLimitations from "@/components/buttons/IosPwaLimitations";
import { BrandPill } from "@/components/layout/BrandPill";
import { Player } from "@/components/player";
import { SkipIntroButton } from "@/components/player/atoms/SkipIntroButton";
import { UnreleasedEpisodeOverlay } from "@/components/player/atoms/UnreleasedEpisodeOverlay";
import { WatchPartyStatus } from "@/components/player/atoms/WatchPartyStatus";
import { Widescreen } from "@/components/player/atoms/Widescreen";
import { useShouldShowControls } from "@/components/player/hooks/useShouldShowControls";
import { useSkipTime } from "@/components/player/hooks/useSkipTime";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PlayerMeta, playerStatus } from "@/stores/player/slices/source";
import { usePlayerStore } from "@/stores/player/store";
import { useWatchPartyStore } from "@/stores/watchParty";

import { ScrapingPartInterruptButton, Tips } from "./ScrapingPart";

export interface FancyPlayerPartProps {
  children?: ReactNode;
  backUrl: string;
  onLoad?: () => void;
  onMetaChange?: (meta: PlayerMeta) => void;
}

export function FancyPlayerPart(props: FancyPlayerPartProps) {
  const { showTargets, showTouchTargets } = useShouldShowControls();
  const status = usePlayerStore((s) => s.status);
  const { isMobile } = useIsMobile();
  const isLoading = usePlayerStore((s) => s.mediaPlaying.isLoading);
  const { isHost, enabled } = useWatchPartyStore();

  const inControl = !enabled || isHost;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isIOSPWA =
    isIOS && window.matchMedia("(display-mode: standalone)").matches;

  const [isShifting, setIsShifting] = useState(false);
  const [isHoldingFullscreen, setIsHoldingFullscreen] = useState(false);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Paused overlay state
  const meta = usePlayerStore((s) => s.meta);
  const isPaused = usePlayerStore((s) => s.mediaPlaying.isPaused);
  const [pausedLogoUrl, setPausedLogoUrl] = useState<string | undefined>();
  const [pausedDescription, setPausedDescription] = useState<
    string | undefined
  >();

  useEffect(() => {
    let isCancelled = false;
    async function loadPauseInfo() {
      if (!meta) return;
      try {
        // Logo for both movies and shows
        const logo = await getMediaLogo(
          meta.tmdbId,
          meta.type === "movie" ? TMDBContentTypes.MOVIE : TMDBContentTypes.TV,
        );
        if (!isCancelled) setPausedLogoUrl(logo);

        if (meta.type === "movie") {
          const details = await getMediaDetails(
            meta.tmdbId,
            TMDBContentTypes.MOVIE,
          );
          const overview = (details as any)?.overview as string | undefined;
          if (!isCancelled) setPausedDescription(overview);
        } else if (meta.season?.number && meta.episode?.number) {
          const eps = await getEpisodes(meta.tmdbId, meta.season.number);
          const thisEp = eps.find(
            (e) => e.episode_number === meta.episode!.number,
          );
          if (!isCancelled) setPausedDescription(thisEp?.overview);
        } else {
          setPausedDescription(undefined);
        }
      } catch {
        // swallow errors for overlay
      }
    }

    // Only fetch when we actually might show it
    if (isPaused && meta) {
      loadPauseInfo();
    }

    return () => {
      isCancelled = true;
    };
  }, [isPaused, meta]);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Shift") {
      setIsShifting(true);
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "Shift") {
      setIsShifting(false);
    }
  });

  const handleTouchStart = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
    }
    holdTimeoutRef.current = setTimeout(() => {
      setIsHoldingFullscreen(true);
    }, 100);
  };

  const handleTouchEnd = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
    }
    holdTimeoutRef.current = setTimeout(() => {
      setIsHoldingFullscreen(false);
    }, 1000);
  };

  const skiptime = useSkipTime();

  return (
    <Player.Container onLoad={props.onLoad} showingControls={showTargets}>
      {props.children}
      <Player.BlackOverlay
        show={showTargets && status === playerStatus.PLAYING}
      />
      <Player.EpisodesRouter onChange={props.onMetaChange} />
      <Player.SettingsRouter />
      <Player.SubtitleView controlsShown={showTargets} />

      <Player.CenterMobileControls
        className="text-white"
        show={showTouchTargets && status === playerStatus.PLAYING}
      >
        <Player.SkipBackward iconSizeClass="text-3xl" inControl={inControl} />
        <Player.Pause
          iconSizeClass="text-5xl"
          className={isLoading ? "opacity-0" : "opacity-100"}
        />
        <Player.SkipForward iconSizeClass="text-3xl" inControl={inControl} />
      </Player.CenterMobileControls>

      <div
        className={`absolute right-4 z-50 transition-all duration-300 ease-in-out ${
          showTargets ? "top-16" : "top-1"
        }`}
      >
        <WatchPartyStatus />
      </div>

      <Player.TopControls show={showTargets}>
        <div className="grid grid-cols-[1fr,auto] xl:grid-cols-3 items-center">
          <div className="flex space-x-3 items-center z-50">
            <Player.BackLink url={props.backUrl} />
            <span className="text mx-3 text-type-secondary">/</span>
            <Player.Title />

            <Player.InfoButton />

            <Player.BookmarkButton />
          </div>
          <div className="text-center hidden xl:flex justify-center items-center">
            <Player.EpisodeTitle />
          </div>
          <div className="hidden sm:flex items-center justify-end">
            <BrandPill />
          </div>
          <div className="flex sm:hidden items-center justify-end">
            {status === playerStatus.PLAYING ? (
              <>
                <Player.Airplay />
                <Player.Chromecast />
              </>
            ) : null}
          </div>
        </div>
      </Player.TopControls>

      <Player.BottomControls show={showTargets}>
        {status === playerStatus.PLAYING ? null : <Tips />}
        <div className="flex items-center justify-center space-x-3 h-full">
          {status === playerStatus.SCRAPING ? (
            <ScrapingPartInterruptButton />
          ) : null}
          {status === playerStatus.PLAYING ? (
            <>
              {isMobile ? <Player.Time short /> : null}
              <Player.ProgressBar />
            </>
          ) : null}
        </div>
        <div className="hidden lg:flex justify-between" dir="ltr">
          <Player.LeftSideControls>
            {status === playerStatus.PLAYING ? (
              <>
                <Player.Pause />
                <Player.SkipBackward inControl={inControl} />
                <Player.SkipForward inControl={inControl} />
                <Player.Volume />
                <Player.Time />
              </>
            ) : null}
          </Player.LeftSideControls>
          <div className="flex items-center space-x-3">
            <Player.Episodes inControl={inControl} />
            {status === playerStatus.PLAYING ? (
              <>
                <Player.Pip />
                <Player.Airplay />
                <Player.Chromecast />
              </>
            ) : null}
            {status === playerStatus.PLAYBACK_ERROR ||
            status === playerStatus.PLAYING ? (
              <Player.Captions />
            ) : null}
            <Player.Settings />
            {/* Fullscreen on when not shifting */}
            {!isShifting && <Player.Fullscreen />}

            {/* Expand button visible when shifting */}
            {isShifting && (
              <div>
                <Widescreen />
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-[2.5rem,1fr,2.5rem] gap-3 lg:hidden">
          <div />
          <div className="flex justify-center space-x-3">
            {/* Disable PiP for iOS PWA */}
            {!isIOSPWA && status === playerStatus.PLAYING && <Player.Pip />}
            <Player.Episodes inControl={inControl} />
            {status === playerStatus.PLAYING ? (
              <div className="hidden ssm:block">
                <Player.Captions />
              </div>
            ) : null}
            <Player.Settings />
            {isIOSPWA && <IosPwaLimitations />}
          </div>
          <div>
            {/* iOS PWA */}
            {!isIOSPWA && (
              <div
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className="select-none touch-none"
                style={{ WebkitTapHighlightColor: "transparent" }}
              >
                {isHoldingFullscreen ? <Widescreen /> : <Player.Fullscreen />}
              </div>
            )}
            {isIOSPWA && status === playerStatus.PLAYING && <Widescreen />}
          </div>
        </div>
      </Player.BottomControls>

      {isPaused && status === playerStatus.PLAYING ? (
        <div className="pointer-events-none absolute inset-0 bg-black/70">
          <div className="absolute left-6 right-6 bottom-28 max-w-3xl text-white">
            {pausedLogoUrl ? (
              <img
                src={pausedLogoUrl}
                alt={meta?.title}
                className="w-64 md:w-80 max-w-[80vw] mb-3"
              />
            ) : (
              <div className="text-4xl font-bold mb-1">{meta?.title}</div>
            )}

            {meta?.type === "show" && meta?.episode?.title ? (
              <div className="text-2xl font-semibold mb-2">
                {meta.episode.title}
              </div>
            ) : null}

            {pausedDescription ? (
              <p className="text-base md:text-lg text-white/90 max-w-2xl">
                {pausedDescription}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {status === playerStatus.PLAYING ? (
        <>
          <Player.CenterControls>
            <Player.LoadingSpinner />
            <Player.AutoPlayStart />
          </Player.CenterControls>
          <Player.CenterControls>
            <Player.CastingNotification />
          </Player.CenterControls>
        </>
      ) : null}

      <Player.VolumeChangedPopout />
      <Player.SubtitleDelayPopout />
      <Player.SpeedChangedPopout />
      <UnreleasedEpisodeOverlay />

      <Player.NextEpisodeButton
        controlsShowing={showTargets}
        onChange={props.onMetaChange}
        inControl={inControl}
      />

      <SkipIntroButton
        controlsShowing={showTargets}
        skipTime={skiptime}
        inControl={inControl}
      />
    </Player.Container>
  );
}
