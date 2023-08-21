import React, {
  memo, useCallback, useEffect, useMemo, useState,
} from '../../../lib/teact/teact';

import type { Account, AccountState } from '../../../global/types';

import { MNEMONIC_COUNT } from '../../../config';
import { getActions, withGlobal } from '../../../global';
import renderText from '../../../global/helpers/renderText';
import { selectCurrentAccountState, selectNetworkAccounts } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { shortenAddress } from '../../../util/shortenAddress';

import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';

import Button from '../../ui/Button';
import Checkbox from '../../ui/Checkbox';
import Modal from '../../ui/Modal';

import modalStyles from '../../ui/Modal.module.scss';
import styles from './LogOutModal.module.scss';

interface OwnProps {
  isOpen?: boolean;
  onClose: (shouldCloseSettings: boolean) => void;
}

interface StateProps {
  currentAccountId: string;
  hasManyAccounts: boolean;
  accounts: Record<string, Account>;
  accountStates: Record<string, AccountState>;
  isBackupRequired?: boolean;
}

interface LinkAccount {
  id: string;
  title: string;
}

function LogOutModal({
  isOpen,
  currentAccountId,
  hasManyAccounts,
  accounts,
  accountStates,
  isBackupRequired,
  onClose,
}: OwnProps & StateProps) {
  const { signOut, switchAccount } = getActions();

  const lang = useLang();
  const [isLogOutFromAllAccounts, setIsLogOutFromAllAccounts] = useState<boolean>(false);

  const accountsWithoutBackups = useMemo(() => {
    if (!hasManyAccounts) {
      return [];
    }

    return Object.entries(accounts).reduce<LinkAccount[]>((acc, [id, { title, address }]) => {
      if (id !== currentAccountId && accountStates[id]?.isBackupRequired) {
        acc.push({
          id,
          title: title || shortenAddress(address)!,
        });
      }

      return acc;
    }, []);
  }, [accounts, accountStates, currentAccountId, hasManyAccounts]);

  useEffect(() => {
    if (isOpen) {
      setIsLogOutFromAllAccounts(false);
    }
  }, [isOpen]);

  const handleSwitchAccount = (accountId: string) => {
    onClose(false);
    switchAccount({ accountId });
  };

  const handleLogOut = useCallback(() => {
    onClose(!isLogOutFromAllAccounts && hasManyAccounts);
    signOut({ isFromAllAccounts: isLogOutFromAllAccounts });
  }, [isLogOutFromAllAccounts, hasManyAccounts, onClose]);

  const handleClose = useLastCallback(() => {
    onClose(false);
  });

  function renderAccountLink(account: LinkAccount, idx: number) {
    const { id, title } = account;
    const fullClassName = buildClassName(
      styles.accountLink,
      idx + 2 === accountsWithoutBackups.length && styles.penultimate,
    );

    return (
      <span className={fullClassName}>
        <a
          key={id}
          href="#"
          className={styles.accountLink_inner}
          onClick={(e: React.MouseEvent) => {
            e.preventDefault();
            handleSwitchAccount(id);
          }}
        >
          {title}
        </a>
      </span>
    );
  }

  function renderBackupWarning() {
    return (
      <p className={modalStyles.text}>
        <b className={styles.warning}>{lang('Warning!')}</b> {lang('$logout_without_backup_warning')}
      </p>
    );
  }

  function renderBackupForAccountsWarning() {
    return (
      <p className={modalStyles.text}>
        <b className={styles.warning}>{lang('Warning!')}</b>{' '}
        {lang('$logout_accounts_without_backup_warning', {
          links: <>{accountsWithoutBackups.map(renderAccountLink)}</>,
        })}
      </p>
    );
  }

  const shouldRenderWarningForAnotherAccounts = isLogOutFromAllAccounts && accountsWithoutBackups.length > 0;
  const shouldRenderWarningForCurrentAccount = isBackupRequired && !shouldRenderWarningForAnotherAccounts;

  return (
    <Modal isOpen={isOpen} isCompact onClose={handleClose} title={lang('Log Out')}>
      <p className={buildClassName(modalStyles.text, modalStyles.text_noExtraMargin)}>
        {renderText(lang('$logout_warning', MNEMONIC_COUNT))}
      </p>
      {hasManyAccounts && (
        <Checkbox
          id="logount_all_accounts"
          className={styles.checkbox}
          checked={isLogOutFromAllAccounts}
          onChange={setIsLogOutFromAllAccounts}
        >
          {renderText(lang('$logout_confirm'))}
        </Checkbox>
      )}

      {shouldRenderWarningForCurrentAccount && renderBackupWarning()}
      {shouldRenderWarningForAnotherAccounts && renderBackupForAccountsWarning()}

      <div className={modalStyles.buttons}>
        <Button onClick={handleClose} className={modalStyles.button}>
          {lang('Cancel')}
        </Button>
        <Button isDestructive onClick={handleLogOut} className={modalStyles.button}>
          {lang('Exit')}
        </Button>
      </div>
    </Modal>
  );
}

export default memo(
  withGlobal<OwnProps>((global): StateProps => {
    const accounts = selectNetworkAccounts(global) || {};
    const currentAccountState = selectCurrentAccountState(global);
    const accountIds = Object.keys(accounts);
    const hasManyAccounts = accountIds.length > 1;

    return {
      currentAccountId: global.currentAccountId!,
      hasManyAccounts,
      accounts,
      accountStates: global.byAccountId,
      isBackupRequired: currentAccountState?.isBackupRequired,
    };
  })(LogOutModal),
);
