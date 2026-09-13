'use client';

import { isApiError } from '@nexa/api-client';
import { Check, Copy, MailPlus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Select, TextField } from '@/components/ui/input';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useOrganization } from '@/features/organization/organization-provider';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { canAssignRole, isRole, ROLES, type Role } from '@/lib/permissions';
import { RowsSkeleton } from './members-panel';
import {
  useCreateInvitation,
  useInvitations,
  useRevokeInvitation,
  type CreatedInvitation,
  type Invitation,
} from './queries';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The link the invitee opens; /invite reads the token and then drops it from the address. */
function inviteLink(token: string): string {
  return `${window.location.origin}/invite?token=${encodeURIComponent(token)}`;
}

function InviteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onCreated(invitation: CreatedInvitation): void;
}) {
  const i18n = useI18n();
  const { t, tryT } = i18n;
  const { organization } = useOrganization();
  const create = useCreateInvitation();
  const roleId = useId();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [emailError, setEmailError] = useState<string | null>(null);
  const roles = ROLES.filter((item) => canAssignRole(organization.role, item));

  function close() {
    onOpenChange(false);
    setEmail('');
    setRole('MEMBER');
    setEmailError(null);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setEmailError(t('admin.invalidEmail'));
      return;
    }
    create.mutate(
      { email: email.trim(), role },
      {
        onSuccess: (invitation) => {
          close();
          onCreated(invitation);
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'ALREADY_MEMBER') {
            setEmailError(describeError(error, i18n));
          } else {
            toast.error(describeError(error, i18n));
          }
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent title={t('admin.inviteTitle')} description={t('admin.inviteDescription')}>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <TextField
            type="email"
            label={t('admin.email')}
            placeholder={t('admin.emailPlaceholder')}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(null);
            }}
            error={emailError}
            autoComplete="off"
            autoFocus
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={roleId} className="text-[13px] font-medium text-fg">
              {t('admin.role')}
            </label>
            <Select
              id={roleId}
              value={role}
              onChange={(event) => {
                const value = event.target.value;
                if (isRole(value)) setRole(value);
              }}
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {tryT(`organization.roles.${item}`) ?? item}
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter className="mt-1">
            <Button type="button" variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!email.trim()} loading={create.isPending}>
              {t('admin.sendInvite')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The one time the invitation link can be seen: only a hash of its token is stored. */
function InviteLinkDialog({
  invitation,
  onClose,
}: {
  invitation: CreatedInvitation | null;
  onClose(): void;
}) {
  const { t, formatDate } = useI18n();
  const [copied, setCopied] = useState(false);
  const link = invitation ? inviteLink(invitation.token) : '';

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success(t('admin.linkCopied'));
  }

  return (
    <Dialog
      open={invitation !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setCopied(false);
        }
      }}
    >
      <DialogContent
        title={t('admin.inviteCreated')}
        description={
          invitation
            ? t('admin.inviteCreatedDescription', {
                email: invitation.email,
                date: formatDate(invitation.expires_at),
              })
            : undefined
        }
      >
        <div className="flex gap-2">
          <Input
            readOnly
            value={link}
            aria-label={t('admin.inviteLink')}
            onFocus={(event) => event.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button variant="secondary" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {t('admin.copyLink')}
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">{t('admin.inviteOnce')}</p>
      </DialogContent>
    </Dialog>
  );
}

/** Pending invitations; invite someone or revoke a link that shouldn't be used anymore. */
export function InvitationsPanel({ startOpen }: { startOpen: boolean }) {
  const i18n = useI18n();
  const { t, tryT, formatDate } = i18n;
  const invitations = useInvitations(true);
  const revoke = useRevokeInvitation();
  const [inviting, setInviting] = useState(startOpen);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const pending = (invitations.data ?? []).filter((item) => item.status === 'PENDING');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('admin.invitationsDescription')}</p>
        <Button size="sm" onClick={() => setInviting(true)}>
          <MailPlus aria-hidden />
          {t('admin.invite')}
        </Button>
      </div>

      {invitations.isPending ? (
        <RowsSkeleton rows={3} />
      ) : invitations.isError ? (
        <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />
      ) : pending.length === 0 ? (
        <EmptyState
          icon={MailPlus}
          title={t('admin.noInvitations')}
          description={t('admin.noInvitationsDescription')}
        />
      ) : (
        <ul className="-mx-3 flex flex-col divide-y divide-border">
          {pending.map((invitation) => {
            const expired = new Date(invitation.expires_at).getTime() < Date.now();
            return (
              <li key={invitation.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <p className="truncate text-xs text-muted">
                    {t('admin.invitedOn', { date: formatDate(invitation.created_at) })} ·{' '}
                    {expired
                      ? t('admin.expired')
                      : t('admin.expiresOn', { date: formatDate(invitation.expires_at) })}
                  </p>
                </div>
                <Badge>{tryT(`organization.roles.${invitation.role}`) ?? invitation.role}</Badge>
                <Button variant="ghost" size="sm" onClick={() => setRevoking(invitation)}>
                  {t('admin.revoke')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <InviteDialog open={inviting} onOpenChange={setInviting} onCreated={setCreated} />
      <InviteLinkDialog invitation={created} onClose={() => setCreated(null)} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={t('admin.revokeTitle')}
        description={t('admin.revokeDescription', { email: revoking?.email ?? '' })}
        confirmLabel={t('admin.revoke')}
        destructive
        loading={revoke.isPending}
        onConfirm={() => {
          if (!revoking) return;
          revoke.mutate(revoking.id, {
            onSuccess: () => {
              toast.success(t('admin.revoked'));
              setRevoking(null);
            },
            onError: (error) => toast.error(describeError(error, i18n)),
          });
        }}
      />
    </div>
  );
}
