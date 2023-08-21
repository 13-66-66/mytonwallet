import React, { memo, useCallback } from '../../lib/teact/teact';

import { APP_NAME, MNEMONIC_COUNT } from '../../config';
import { getActions } from '../../global';
import renderText from '../../global/helpers/renderText';
import buildClassName from '../../util/buildClassName';
import { IS_LEDGER_SUPPORTED } from '../../util/windowEnvironment';

import useFlag from '../../hooks/useFlag';
import useLang from '../../hooks/useLang';
import useShowTransition from '../../hooks/useShowTransition';

import Button from '../ui/Button';

import styles from './Auth.module.scss';

import logoPath from '../../assets/logo.svg';

const AuthStart = () => {
  const {
    startCreatingWallet,
    startImportingWallet,
    openAbout,
    openHardwareWalletModal,
  } = getActions();

  const lang = useLang();
  const [isLogoReady, markLogoReady] = useFlag();
  const { transitionClassNames } = useShowTransition(isLogoReady, undefined, undefined, 'slow');

  const handleCreateWallet = useCallback(() => {
    startCreatingWallet();
  }, [startCreatingWallet]);

  return (
    <div className={buildClassName(styles.container, 'custom-scroll')}>
      <img
        src={logoPath}
        alt={APP_NAME}
        className={buildClassName(styles.logo, transitionClassNames)}
        onLoad={markLogoReady}
      />
      <div className={styles.appName}>{APP_NAME}</div>
      <div className={styles.info}>
        {renderText(lang('$auth_intro'))}
      </div>
      <Button
        isText
        className={buildClassName(styles.btn, styles.btn_about)}
        onClick={openAbout}
      >
        {lang('More about MyTonWallet')}
        <i className="icon-chevron-right" aria-hidden />
      </Button>
      <div className={styles.importButtonsBlock}>
        <Button
          isPrimary
          className={styles.btn}
          onClick={handleCreateWallet}
        >
          {lang('Create Wallet')}
        </Button>
        <span className={styles.importText}>{lang('Or import from...')}</span>
        <div className={styles.importButtons}>
          <Button
            className={buildClassName(styles.btn, !IS_LEDGER_SUPPORTED && styles.btn_single)}
            onClick={startImportingWallet}
          >
            {lang('%1$d Secret Words', MNEMONIC_COUNT)}
          </Button>
          {IS_LEDGER_SUPPORTED && (
            <Button
              className={buildClassName(styles.btn, styles.btn_mini)}
              onClick={openHardwareWalletModal}
            >
              {lang('Ledger')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(AuthStart);
