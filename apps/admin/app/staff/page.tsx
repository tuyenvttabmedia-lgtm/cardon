'use client';



import { useEffect, useState } from 'react';

import { RequirePermission } from '@/components/layout/AdminShell';

import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';

import { Button, Input, Label, Select } from '@/components/ui/Form';

import { useToast } from '@/components/ui/Toast';

import { translateRole } from '@/lib/i18n';

import { vi } from '@/lib/i18n/vi';

import { adminApi, ApiClientError } from '@/services/api-client';

import type { AdminStaff } from '@/types/api';



const STAFF_ROLES = ['SUPPORT', 'MARKETING', 'ACCOUNTANT', 'ADMIN'] as const;



export default function StaffPage() {

  const toast = useToast();

  const [staff, setStaff] = useState<AdminStaff[]>([]);

  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ email: '', password: '', fullName: '', role: 'SUPPORT' });



  async function load() {

    try {

      setStaff(await adminApi.listStaff());

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.staff.loadError);

    }

  }



  useEffect(() => {

    void load();

  }, []);



  async function createStaff(e: React.FormEvent) {

    e.preventDefault();

    try {

      await adminApi.createStaff(form);

      setForm({ email: '', password: '', fullName: '', role: 'SUPPORT' });

      toast.success(vi.staff.createSuccess);

      await load();

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.staff.createError);

    }

  }



  async function disableStaff(id: string) {

    if (!window.confirm(vi.staff.disableConfirm)) return;

    try {

      await adminApi.disableStaff(id);

      toast.success(vi.staff.disableSuccess);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  async function enableStaff(id: string) {

    try {

      await adminApi.enableStaff(id);

      toast.success(vi.staff.enableSuccess);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  async function deleteStaff(id: string) {

    if (!window.confirm(vi.staff.deleteConfirm)) return;

    try {

      await adminApi.deleteStaff(id);

      toast.success(vi.staff.deleteSuccess);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  async function resetPassword(id: string) {

    try {

      await adminApi.resetStaffPassword(id);

      toast.success(vi.staff.resetSuccess);

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  return (

    <RequirePermission permission="users.manage">

      <div className="space-y-6">

        <h1 className="text-2xl font-bold">{vi.staff.title}</h1>

        {error && <ErrorMessage message={error} />}

        <Card className="p-4">

          <h2 className="mb-3 font-semibold">{vi.staff.createTitle}</h2>

          <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void createStaff(e)}>

            <div>

              <Label>{vi.staff.email}</Label>

              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />

            </div>

            <div>

              <Label>{vi.staff.fullName}</Label>

              <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />

            </div>

            <div>

              <Label>{vi.staff.password}</Label>

              <Input

                type="password"

                value={form.password}

                onChange={(e) => setForm({ ...form, password: e.target.value })}

                required

              />

            </div>

            <div>

              <Label>{vi.staff.role}</Label>

              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>

                {STAFF_ROLES.map((role) => (

                  <option key={role} value={role}>

                    {translateRole(role)}

                  </option>

                ))}

              </Select>

            </div>

            <Button type="submit" className="md:col-span-2">

              {vi.staff.create}

            </Button>

          </form>

        </Card>

        <Card className="overflow-x-auto p-4">

          <table className="w-full text-sm">

            <thead>

              <tr className="border-b">

                <th className="py-2 text-left">{vi.staff.email}</th>

                <th>{vi.staff.role}</th>

                <th>{vi.staff.status}</th>

                <th />

              </tr>

            </thead>

            <tbody>

              {staff.map((s) => (

                <tr key={s.id} className="border-b">

                  <td className="py-2">{s.email}</td>

                  <td>{translateRole(s.role)}</td>

                  <td>

                    <Badge tone={statusTone(s.status)} status={s.status} />

                  </td>

                  <td className="space-x-2">

                    {s.role !== 'SUPER_ADMIN' && s.status === 'ACTIVE' && (

                      <Button size="sm" variant="secondary" onClick={() => void disableStaff(s.id)}>

                        {vi.staff.disable}

                      </Button>

                    )}

                    {s.role !== 'SUPER_ADMIN' && s.status === 'SUSPENDED' && (

                      <Button size="sm" variant="secondary" onClick={() => void enableStaff(s.id)}>

                        {vi.staff.enable}

                      </Button>

                    )}

                    {s.role !== 'SUPER_ADMIN' && (

                      <Button size="sm" variant="danger" onClick={() => void deleteStaff(s.id)}>

                        {vi.staff.delete}

                      </Button>

                    )}

                    <Button size="sm" variant="ghost" onClick={() => void resetPassword(s.id)}>

                      {vi.staff.resetPassword}

                    </Button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </Card>

      </div>

    </RequirePermission>

  );

}

