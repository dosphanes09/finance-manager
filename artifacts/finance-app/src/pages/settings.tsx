import React, { useState } from "react";
import { useLoadDemoData, useDeleteAllData } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, Database, Trash2, Play, Lock, Eye, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const loadDemo = useLoadDemoData();
  const deleteAll = useDeleteAllData();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [demoLoaded, setDemoLoaded] = useState(false);

  const handleLoadDemo = () => {
    loadDemo.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        setDemoLoaded(true);
        toast({
          title: "Demo data loaded",
          description: `${data.count} sample transactions imported across 6 months.`,
        });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to load demo data" }),
    });
  };

  const handleDeleteAll = () => {
    deleteAll.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        toast({
          title: "All data deleted",
          description: `Removed ${data.transactions} transactions and ${data.budgets} budgets.`,
        });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to delete data" }),
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your data and privacy preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Privacy & Data Storage
          </CardTitle>
          <CardDescription>How FinTrack handles your financial data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              icon: <EyeOff className="w-4 h-4 text-emerald-500" />,
              title: "Files never stored",
              desc: "Uploaded bank statements (CSV, Excel, PDF) are deleted immediately after parsing. Only structured transaction fields are kept.",
            },
            {
              icon: <Lock className="w-4 h-4 text-emerald-500" />,
              title: "Sensitive data masked",
              desc: "IBAN numbers, 16-digit card numbers, and long account numbers are masked with **** before being stored.",
            },
            {
              icon: <Eye className="w-4 h-4 text-emerald-500" />,
              title: "No third-party sharing",
              desc: "Your transaction data stays in your own database. No data is sent to analytics or advertising services.",
            },
            {
              icon: <Database className="w-4 h-4 text-emerald-500" />,
              title: "Data stored",
              desc: "Only: transaction date, merchant name, masked description, amount, type, category, and optional notes.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3 p-3 rounded-lg bg-muted/50">
              <div className="shrink-0 mt-0.5">{item.icon}</div>
              <div>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            Demo Data
          </CardTitle>
          <CardDescription>
            Load 6 months of realistic sample transactions to explore the app without uploading real bank statements.
            Useful for portfolio presentations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleLoadDemo}
              disabled={loadDemo.isPending}
              variant="outline"
            >
              <Database className="w-4 h-4 mr-2" />
              {loadDemo.isPending ? "Loading..." : "Load Demo Data"}
            </Button>
            {demoLoaded && (
              <Badge variant="outline" className="text-emerald-600 border-emerald-400">
                ✓ Demo data loaded
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Permanently delete all your transaction and budget data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete All Data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all transactions, budgets, and categories from your account.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAll}
                  className="bg-destructive hover:bg-destructive/90"
                  disabled={deleteAll.isPending}
                >
                  Yes, delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
