'use client';

import { isApiError } from '@nexa/api-client';
import {
  Building2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { Input, Textarea, TextField } from '@/components/ui/input';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useOrganization } from '@/features/organization/organization-provider';
import { useDepartments, useMembers } from '@/features/people/queries';
import { useI18n } from '@/i18n/provider';
import { describeError } from '@/lib/api/errors';
import { fold } from '@/lib/format';
import { can } from '@/lib/permissions';
import type { Department, UserRef } from '@/lib/types';
import { RowsSkeleton } from './members-panel';
import {
  useAddDepartmentMember,
  useCreateDepartment,
  useDeleteDepartment,
  useDepartmentMembers,
  useRemoveDepartmentMember,
  useUpdateDepartment,
} from './queries';

/** Errors about the name itself are shown on the field. */
const NAME_ERRORS = new Set(['DEPARTMENT_EXISTS', 'INVALID_DEPARTMENT_NAME']);
const MAX_CANDIDATES = 8;

const isUser = (user: UserRef | null): user is UserRef => Boolean(user);

/** Create a department, or edit one when `department` is given. */
function DepartmentDialog({
  department,
  onClose,
}: {
  department: Department | null;
  onClose(): void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const descriptionId = useId();
  const [name, setName] = useState(department?.name ?? '');
  const [description, setDescription] = useState(department?.description ?? '');
  const [nameError, setNameError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const body = { name: name.trim(), description: description.trim() || null };
    const handlers = {
      onSuccess: () => {
        onClose();
        toast.success(t(department ? 'admin.departmentSaved' : 'admin.departmentCreated'));
      },
      onError: (error: unknown) => {
        if (isApiError(error) && NAME_ERRORS.has(error.code)) {
          setNameError(describeError(error, i18n));
        } else {
          toast.error(describeError(error, i18n));
        }
      },
    };
    if (department) update.mutate({ departmentId: department.id, ...body }, handlers);
    else create.mutate(body, handlers);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={department ? t('admin.editDepartment') : t('admin.newDepartment')}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <TextField
            label={t('admin.departmentName')}
            placeholder={t('admin.departmentNamePlaceholder')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameError(null);
            }}
            error={nameError}
            maxLength={100}
            autoFocus
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={descriptionId} className="text-[13px] font-medium text-fg">
              {t('admin.departmentDescriptionLabel')}
            </label>
            <Textarea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('admin.departmentDescriptionPlaceholder')}
              maxLength={500}
              rows={3}
            />
          </div>
          <DialogFooter className="mt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!name.trim()}
              loading={create.isPending || update.isPending}
            >
              {department ? t('common.save') : t('admin.createDepartment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Who is in a department; managers add people by searching the organization. */
function DepartmentMembersDialog({
  department,
  manage,
  onClose,
}: {
  department: Department;
  manage: boolean;
  onClose(): void;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const members = useDepartmentMembers(department.id);
  const everyone = useMembers();
  const add = useAddDepartmentMember();
  const remove = useRemoveDepartmentMember();
  const [query, setQuery] = useState('');

  const current = (members.data ?? []).filter(isUser);
  const inDepartment = new Set(current.map((user) => user.id));
  const needle = fold(query.trim());
  const candidates = needle
    ? (everyone.data ?? [])
        .flatMap((member) =>
          member.user &&
          member.status === 'ACTIVE' &&
          !member.user.deactivated &&
          !inDepartment.has(member.user.id) &&
          (fold(member.user.display_name).includes(needle) ||
            fold(member.user.username).includes(needle))
            ? [member.user]
            : [],
        )
        .slice(0, MAX_CANDIDATES)
    : [];
  const onError = (error: unknown) => toast.error(describeError(error, i18n));

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent title={t('admin.departmentMembers', { name: department.name })}>
        {manage && (
          <div className="mb-4">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('admin.addPeople')}
                aria-label={t('admin.addPeople')}
                className="pl-9"
              />
            </div>
            {candidates.length > 0 && (
              <ul className="mt-1 divide-y divide-border rounded-lg border border-border">
                {candidates.map((user) => (
                  <li key={user.id} className="flex items-center gap-3 px-3 py-2">
                    <Avatar name={user.display_name} src={user.avatar_url} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{user.display_name}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={add.isPending && add.variables?.userId === user.id}
                      onClick={() =>
                        add.mutate({ departmentId: department.id, userId: user.id }, { onError })
                      }
                    >
                      <UserPlus aria-hidden />
                      {t('admin.add')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {members.isPending ? (
          <RowsSkeleton rows={3} />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        ) : current.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('admin.noDepartmentMembers')}</p>
        ) : (
          <ul className="flex flex-col">
            {current.map((user) => (
              <li key={user.id} className="flex items-center gap-3 py-2">
                <Avatar name={user.display_name} src={user.avatar_url} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{user.display_name}</span>
                  <span className="block truncate text-xs text-muted">@{user.username}</span>
                </span>
                {manage && (
                  <IconButton
                    label={t('admin.removeFromDepartment', { name: user.display_name })}
                    icon={X}
                    size="icon-sm"
                    disabled={remove.isPending && remove.variables?.userId === user.id}
                    onClick={() =>
                      remove.mutate({ departmentId: department.id, userId: user.id }, { onError })
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Departments of the organization; the directory groups people by them. */
export function DepartmentsPanel() {
  const i18n = useI18n();
  const { t, tn, locale } = i18n;
  const { organization } = useOrganization();
  const manage = can(organization.role, 'department.manage');
  const departments = useDepartments();
  const remove = useDeleteDepartment();
  const [editing, setEditing] = useState<Department | 'new' | null>(null);
  const [viewing, setViewing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const list = [...(departments.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('admin.departmentsDescription')}</p>
        {manage && (
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            {t('admin.newDepartment')}
          </Button>
        )}
      </div>

      {departments.isPending ? (
        <RowsSkeleton rows={4} />
      ) : departments.isError ? (
        <ErrorState error={departments.error} onRetry={() => departments.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t('admin.noDepartments')}
          description={manage ? t('admin.noDepartmentsDescription') : undefined}
        />
      ) : (
        <ul className="-mx-3 flex flex-col divide-y divide-border">
          {list.map((department) => (
            <li key={department.id} className="flex items-center gap-3 px-3 py-2.5">
              <span
                aria-hidden
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-subtle text-muted"
              >
                <Building2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{department.name}</p>
                <p className="truncate text-xs text-muted">
                  {[tn('people.memberCount', department.member_count), department.description]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setViewing(department)}>
                <Users aria-hidden />
                {t('admin.members')}
              </Button>
              {manage && (
                <Menu>
                  <MenuTrigger
                    aria-label={t('admin.departmentActions', { name: department.name })}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-subtle hover:text-fg"
                  >
                    <MoreHorizontal className="size-4" aria-hidden />
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem onSelect={() => setEditing(department)}>
                      <Pencil aria-hidden />
                      {t('admin.edit')}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem destructive onSelect={() => setDeleting(department)}>
                      <Trash2 aria-hidden />
                      {t('admin.delete')}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <DepartmentDialog
          key={editing === 'new' ? 'new' : editing.id}
          department={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {viewing && (
        <DepartmentMembersDialog
          department={viewing}
          manage={manage}
          onClose={() => setViewing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t('admin.deleteDepartmentTitle', { name: deleting?.name ?? '' })}
        description={t('admin.deleteDepartmentDescription')}
        confirmLabel={t('admin.delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('admin.departmentDeleted'));
              setDeleting(null);
            },
            onError: (error) => toast.error(describeError(error, i18n)),
          });
        }}
      />
    </div>
  );
}
