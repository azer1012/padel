import { useGetMe, useUpdateMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";

export default function Profile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useGetMe();
  const updateMutation = useUpdateMe();

  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", language: "fr" });

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: user.phone ?? "",
        language: user.language ?? "fr",
      });
    }
  }, [user]);

  function handleSave() {
    updateMutation.mutate({ data: { firstName: form.firstName, lastName: form.lastName, phone: form.phone, language: form.language as any } }, {
      onSuccess: () => {
        toast({ title: "Profile updated" });
        queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      },
      onError: () => toast({ title: "Error updating profile", variant: "destructive" }),
    });
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold uppercase text-primary">Profile</h1>
            <p className="text-muted-foreground text-sm">Manage your account settings</p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input data-testid="input-first-name" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="Ahmed" />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input data-testid="input-last-name" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Ben Ali" />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled className="opacity-50 cursor-not-allowed" />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed here</p>
              </div>
              <div>
                <Label>Phone</Label>
                <Input data-testid="input-phone" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+216 XX XXX XXX" />
              </div>
              <div>
                <Label>Language Preference</Label>
                <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger data-testid="select-language"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button data-testid="btn-save-profile" onClick={handleSave} disabled={updateMutation.isPending} className="w-full bg-primary text-primary-foreground font-bold">
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
