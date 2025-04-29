import { BottomSheet } from 'native-bottom-sheet';
import React, {
  memo, useEffect, useMemo, useRef, useState,
} from '../lib/teact/teact';
import { getActions, withGlobal } from '../global';

import type { AutolockValueType, Theme } from '../global/types';

import {
  APP_NAME, AUTOLOCK_OPTIONS_LIST, DEBUG, IS_CORE_WALLET, IS_TELEGRAM_APP,
} from '../config';
import {
  selectIsBiometricAuthEnabled,
  selectIsNativeBiometricAuthEnabled,
  selectIsPasswordAccount,
} from '../global/selectors';
import { getDoesUsePinPad, getIsNativeBiometricAuthSupported } from '../util/biometrics';
import buildClassName from '../util/buildClassName';
import { stopEvent } from '../util/domEvents';
import { vibrateOnSuccess } from '../util/haptics';
import { createSignal } from '../util/signals';
import {
  IS_DELEGATED_BOTTOM_SHEET,
  IS_DELEGATING_BOTTOM_SHEET,
  IS_ELECTRON,
} from '../util/windowEnvironment';
import { callApi } from '../api';

import useAppTheme from '../hooks/useAppTheme';
import useBackgroundMode, { isBackgroundModeActive } from '../hooks/useBackgroundMode';
import useEffectOnce from '../hooks/useEffectOnce';
import useFlag from '../hooks/useFlag';
import useForceUpdate from '../hooks/useForceUpdate';
import { useHotkeys } from '../hooks/useHotkeys';
import useLang from '../hooks/useLang';
import useLastCallback from '../hooks/useLastCallback';
import useShowTransition from '../hooks/useShowTransition';
import useThrottledCallback from '../hooks/useThrottledCallback';

import Button from './ui/Button';
import Image from './ui/Image';
import { getInAppBrowser } from './ui/InAppBrowser';
import PasswordForm, { triggerPasswordFormHandleBiometrics } from './ui/PasswordForm';
import Transition from './ui/Transition';

import styles from './AppLocked.module.scss';

import coreWalletLogoPath from '../assets/logoCoreWallet.svg';
import logoDarkPath from '../assets/logoDark.svg';
import logoLightPath from '../assets/logoLight.svg';

const WINDOW_EVENTS_LATENCY = 5000;
const INTERVAL_CHECK_PERIOD = 5000;
const PINPAD_RESET_DELAY = 300;
const ACTIVATION_EVENT_NAMES = [
  'focus', // For Web
  'mousemove', // For Web
  'touch', // For Capacitor
  'wheel',
  'keydown',
];
// `capture: true` is necessary because otherwise a `stopPropagation` call inside the main UI will prevent the event
// from getting to the listeners inside `AppLocked`.
const ACTIVATION_EVENT_OPTIONS = { capture: true };

interface StateProps {
  isNonNativeBiometricAuthEnabled: boolean;
  autolockValue?: AutolockValueType;
  theme: Theme;
  isManualLockActive?: boolean;
  isAppLockEnabled?: boolean;
  shouldHideBiometrics?: boolean;
  canRender: boolean;
}

const enum SLIDES {
  button,
  passwordForm,
}

const [getActivitySignal, setActivitySignal] = createSignal(Date.now());

export function reportAppLockActivityEvent() {
  setActivitySignal(Date.now());
}

function useAppLockState(defaultValue?: boolean, canRender?: boolean) {
  const isLockedRef = useRef(defaultValue);
  const forceUpdate = useForceUpdate();

  // For cases when `canRender` changes from `true` -> `false`, e.g. when all accounts are deleted
  if (isLockedRef.current && !canRender) {
    isLockedRef.current = false;
  }

  const lock = useLastCallback(() => {
    isLockedRef.current = true;
    forceUpdate();
  });

  const unlock = useLastCallback(() => {
    isLockedRef.current = false;
    forceUpdate();
  });

  return [isLockedRef.current, lock, unlock] as const;
}

function AppLocked({
  isNonNativeBiometricAuthEnabled,
  autolockValue = 'never',
  theme,
  isManualLockActive,
  isAppLockEnabled,
  shouldHideBiometrics,
  canRender,
}: StateProps): TeactJsx {
  const {
    setIsPinAccepted, clearIsPinAccepted, submitAppLockActivityEvent, setIsManualLockActive,
  } = getActions();
  const lang = useLang();

  const appTheme = useAppTheme(theme);
  const logoPath = IS_CORE_WALLET
    ? coreWalletLogoPath
    : appTheme === 'light' ? logoLightPath : logoDarkPath;

  const [isLocked, lock, unlock] = useAppLockState(autolockValue !== 'never' || isManualLockActive, canRender);
  const [shouldRenderUi, showUi, hideUi] = useFlag(isLocked);
  const lastActivityTime = useRef(Date.now());
  const [slideForBiometricAuth, setSlideForBiometricAuth] = useState(
    isBackgroundModeActive() ? SLIDES.button : SLIDES.passwordForm,
  );
  const [passwordError, setPasswordError] = useState('');

  const handleActivity = useLastCallback(() => {
    if (IS_DELEGATED_BOTTOM_SHEET) {
      submitAppLockActivityEvent();
      return;
    }
    lastActivityTime.current = Date.now();
  });

  const handleActivityThrottled = useThrottledCallback(handleActivity, [handleActivity], WINDOW_EVENTS_LATENCY);

  const afterUnlockCallback = useLastCallback(() => {
    hideUi();
    setSlideForBiometricAuth(SLIDES.button);
    getInAppBrowser()?.show();
    clearIsPinAccepted();
    handleActivity();
    setIsManualLockActive({ isActive: undefined, shouldHideBiometrics: undefined });
    if (IS_DELEGATING_BOTTOM_SHEET) void BottomSheet.show();
  });

  const autolockPeriod = useMemo(
    () => AUTOLOCK_OPTIONS_LIST.find((option) => option.value === autolockValue)!.period, [autolockValue],
  );

  const { transitionClassNames } = useShowTransition(isLocked, afterUnlockCallback, true, 'slow');

  const forceLockApp = useLastCallback(() => {
    lock();
    showUi();
    if (IS_DELEGATING_BOTTOM_SHEET) void BottomSheet.hide();
    void getInAppBrowser()?.hide();
    setSlideForBiometricAuth(SLIDES.button);
  });

  const handleLock = useLastCallback(() => {
    if ((autolockValue !== 'never' || isManualLockActive) && canRender) forceLockApp();
  });

  if (DEBUG) (window as any).lock = handleLock;

  if (isManualLockActive && !isLocked && !shouldRenderUi) handleLock();

  const handleChangeSlideForBiometricAuth = useLastCallback(() => {
    setSlideForBiometricAuth(SLIDES.passwordForm);
  });

  const handleSubmitPassword = useLastCallback(async (password: string) => {
    const result = await callApi('verifyPassword', password);

    if (!result) {
      setPasswordError('Wrong password, please try again.');
      return;
    }

    if (getDoesUsePinPad()) {
      setIsPinAccepted();
      await vibrateOnSuccess(true);
    }
    unlock();
  });

  const handlePasswordChange = useLastCallback(() => setPasswordError(''));

  useEffectOnce(() => {
    for (const eventName of ACTIVATION_EVENT_NAMES) {
      window.addEventListener(eventName, handleActivityThrottled, ACTIVATION_EVENT_OPTIONS);
    }

    return () => {
      for (const eventName of ACTIVATION_EVENT_NAMES) {
        window.removeEventListener(eventName, handleActivityThrottled, ACTIVATION_EVENT_OPTIONS);
      }
    };
  });

  useEffectOnce(() => {
    if (IS_DELEGATED_BOTTOM_SHEET) return undefined;

    return getActivitySignal.subscribe(handleActivityThrottled);
  });

  const handleLockScreenHotkey = useLastCallback((e: KeyboardEvent) => {
    stopEvent(e);
    setIsManualLockActive({ isActive: true, shouldHideBiometrics: true });
  });

  useHotkeys(useMemo(() => (isAppLockEnabled && !isLocked ? {
    'Ctrl+Shift+L': handleLockScreenHotkey,
    'Alt+Shift+L': handleLockScreenHotkey,
    'Meta+Shift+L': handleLockScreenHotkey,
    ...(IS_ELECTRON && { 'Mod+L': handleLockScreenHotkey }),
  } : undefined), [isAppLockEnabled, isLocked]));

  useEffect(() => {
    if (IS_DELEGATED_BOTTOM_SHEET) return undefined;

    const interval = setInterval(() => {
      if (isAppLockEnabled && !isLocked && Date.now() - lastActivityTime.current > autolockPeriod) {
        handleLock();
      }
    }, INTERVAL_CHECK_PERIOD);
    return () => clearInterval(interval);
  }, [isLocked, autolockPeriod, handleLock, isAppLockEnabled]);

  useBackgroundMode(undefined, handleChangeSlideForBiometricAuth);

  function renderLogo() {
    return (
      <div className={styles.logo}>
        <Image className={styles.logo} imageClassName={styles.logo} url={logoPath} alt="Logo" />
      </div>
    );
  }

  function renderTransitionContent(isActive: boolean) {
    const isFixedSlide = isNonNativeBiometricAuthEnabled && slideForBiometricAuth === SLIDES.button;

    return (
      <div
        className={buildClassName(styles.appLocked, isNonNativeBiometricAuthEnabled && styles.appLockedFixed)}
      >
        {
          isFixedSlide ? (
            <>
              {renderLogo()}
              <span className={buildClassName(styles.title, 'rounded-font')}>{APP_NAME}</span>
              <Button
                isPrimary
                className={!isActive ? styles.unlockButtonHidden : undefined}
                onClick={handleChangeSlideForBiometricAuth}
              >
                {lang('Unlock')}
              </Button>
            </>
          ) : (
            <PasswordForm
              isActive={getIsNativeBiometricAuthSupported() ? !shouldHideBiometrics : true}
              noAnimatedIcon
              forceBiometricsInMain
              error={passwordError}
              resetStateDelayMs={PINPAD_RESET_DELAY}
              operationType="unlock"
              containerClassName={styles.passwordFormContent}
              inputWrapperClassName={styles.passwordInputWrapper}
              submitLabel={lang('Unlock')}
              onSubmit={handleSubmitPassword}
              onUpdate={handlePasswordChange}
            >
              {renderLogo()}
              <span className={buildClassName(styles.title, 'rounded-font')}>{APP_NAME}</span>
            </PasswordForm>
          )
        }
      </div>
    );
  }

  const transitionKey = Number(slideForBiometricAuth === SLIDES.passwordForm) + Number(shouldRenderUi) * 2;

  const handleUnlockIntent = isNonNativeBiometricAuthEnabled
    ? slideForBiometricAuth === SLIDES.passwordForm
      ? triggerPasswordFormHandleBiometrics
      : handleChangeSlideForBiometricAuth
    : undefined;

  useHotkeys(useMemo(() => (isAppLockEnabled && isLocked && handleUnlockIntent ? {
    Space: handleUnlockIntent,
    Enter: handleUnlockIntent,
    Escape: handleUnlockIntent,
  } : undefined), [isAppLockEnabled, isLocked, handleUnlockIntent]));

  if (IS_DELEGATED_BOTTOM_SHEET) return undefined;

  return (
    <Transition
      name={isNonNativeBiometricAuthEnabled && IS_TELEGRAM_APP ? 'slideFade' : 'semiFade'}
      onContainerClick={handleUnlockIntent}
      activeKey={transitionKey}
      className={buildClassName(transitionClassNames, styles.appLockedWrapper)}
      shouldCleanup
    >
      {shouldRenderUi ? renderTransitionContent : undefined}
    </Transition>
  );
}

export default memo(withGlobal((global): StateProps => {
  const { autolockValue, isAppLockEnabled } = global.settings;

  const isPasswordAccount = selectIsPasswordAccount(global);

  const isBiometricAuthEnabled = selectIsBiometricAuthEnabled(global);
  const isNativeBiometricAuthEnabled = selectIsNativeBiometricAuthEnabled(global);
  const isNonNativeBiometricAuthEnabled = isBiometricAuthEnabled && (!isNativeBiometricAuthEnabled || IS_TELEGRAM_APP);

  return {
    isNonNativeBiometricAuthEnabled,
    autolockValue,
    canRender: Boolean(isAppLockEnabled && isPasswordAccount),
    isAppLockEnabled,
    theme: global.settings.theme,
    isManualLockActive: global.isManualLockActive,
    shouldHideBiometrics: global.appLockHideBiometrics,
  };
})(AppLocked));
