import React, { memo } from '../../../../lib/teact/teact';
import { getActions } from '../../../../global';

import type { StakingStateStatus } from '../../../../global/helpers/staking';

import { IS_CORE_WALLET, IS_STAKING_DISABLED } from '../../../../config';
import buildClassName from '../../../../util/buildClassName';
import { vibrate } from '../../../../util/haptics';

import useLang from '../../../../hooks/useLang';
import useLastCallback from '../../../../hooks/useLastCallback';

import Button from '../../../ui/Button';
import { STAKING_TAB_TEXT_VARIANTS } from './LandscapeActions';

import styles from './PortraitActions.module.scss';

interface OwnProps {
  isTestnet?: boolean;
  stakingStatus: StakingStateStatus;
  onEarnClick: NoneToVoidFunction;
  isLedger?: boolean;
  isSwapDisabled?: boolean;
  isOnRampDisabled?: boolean;
}

function PortraitActions({
  isTestnet,
  stakingStatus,
  onEarnClick,
  isLedger,
  isSwapDisabled,
  isOnRampDisabled,
}: OwnProps) {
  const {
    startTransfer, startSwap, openReceiveModal,
  } = getActions();

  const lang = useLang();

  const isSwapAllowed = !isTestnet && !isLedger && !isSwapDisabled;
  const isOnRampAllowed = !isTestnet && !isOnRampDisabled;
  const isStakingAllowed = !isTestnet && !IS_STAKING_DISABLED;
  const addBuyButtonName = IS_CORE_WALLET
    ? 'Receive'
    : (isSwapAllowed || isOnRampAllowed ? 'Add / Buy' : 'Add');

  const handleStartSwap = useLastCallback(() => {
    void vibrate();

    startSwap();
  });

  const handleStartTransfer = useLastCallback(() => {
    void vibrate();

    startTransfer({ isPortrait: true });
  });

  const handleAddBuyClick = useLastCallback(() => {
    void vibrate();

    openReceiveModal();
  });

  const handleEarnClick = useLastCallback(() => {
    void vibrate();

    onEarnClick();
  });

  return (
    <div className={styles.container}>
      <div className={styles.buttons}>
        <Button
          isSimple
          className={styles.button}
          onClick={handleAddBuyClick}
        >
          <i className={buildClassName(styles.buttonIcon, 'icon-action-add')} aria-hidden />
          {lang(addBuyButtonName)}
        </Button>
        <Button
          isSimple
          className={styles.button}
          onClick={handleStartTransfer}
        >
          <i className={buildClassName(styles.buttonIcon, 'icon-action-send')} aria-hidden />
          {lang('Send')}
        </Button>
        {isSwapAllowed && (
          <Button
            isSimple
            className={styles.button}
            onClick={handleStartSwap}
          >
            <i className={buildClassName(styles.buttonIcon, 'icon-action-swap')} aria-hidden />
            {lang('Swap')}
          </Button>
        )}
        {isStakingAllowed && (
          <Button
            isSimple
            className={buildClassName(styles.button, stakingStatus !== 'inactive' && styles.button_purple)}
            onClick={handleEarnClick}
          >
            <i className={buildClassName(styles.buttonIcon, 'icon-action-earn')} aria-hidden />
            {lang(STAKING_TAB_TEXT_VARIANTS[stakingStatus])}
          </Button>
        )}
      </div>
    </div>
  );
}

export default memo(PortraitActions);
