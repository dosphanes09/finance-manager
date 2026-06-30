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
          title: "Demo veri yüklendi",
          description: `6 aylık ${data.count} örnek işlem içe aktarıldı.`,
        });
      },
      onError: () => toast({ variant: "destructive", title: "Demo veri yüklenemedi" }),
    });
  };

  const handleDeleteAll = () => {
    deleteAll.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        toast({
          title: "Tüm veriler silindi",
          description: `${data.transactions} işlem ve ${data.budgets} bütçe kaldırıldı.`,
        });
      },
      onError: () => toast({ variant: "destructive", title: "Veriler silinemedi" }),
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ayarlar</h1>
        <p className="text-muted-foreground mt-1">Veri ve gizlilik tercihlerinizi yönetin.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Gizlilik ve Veri Saklama
          </CardTitle>
          <CardDescription>FinTracker finansal verilerinizi nasıl işler?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              icon: <EyeOff className="w-4 h-4 text-emerald-500" />,
              title: "Dosyalar saklanmaz",
              desc: "Yüklenen banka ekstreleri (CSV, Excel, PDF) ayrıştırmadan sonra hemen silinir. Yalnızca yapılandırılmış işlem alanları tutulur.",
            },
            {
              icon: <Lock className="w-4 h-4 text-emerald-500" />,
              title: "Hassas veriler maskelenir",
              desc: "IBAN, 16 haneli kart numaraları ve uzun hesap numaraları kaydedilmeden önce **** ile maskelenir.",
            },
            {
              icon: <Eye className="w-4 h-4 text-emerald-500" />,
              title: "Üçüncü taraf paylaşımı yok",
              desc: "İşlem verileriniz kendi veritabanınızda kalır. Analitik veya reklam servislerine veri gönderilmez.",
            },
            {
              icon: <Database className="w-4 h-4 text-emerald-500" />,
              title: "Saklanan veriler",
              desc: "Yalnızca işlem tarihi, iş yeri adı, maskelenmiş açıklama, tutar, tür, kategori ve isteğe bağlı notlar saklanır.",
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
            Demo Veri
          </CardTitle>
          <CardDescription>
            Gerçek banka ekstresi yüklemeden uygulamayı denemek için 6 aylık gerçekçi örnek işlem yükleyin.
            Portföy sunumları için kullanışlıdır.
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
              {loadDemo.isPending ? "Yükleniyor..." : "Demo veriyi yükle"}
            </Button>
            {demoLoaded && (
              <Badge variant="outline" className="text-emerald-600 border-emerald-400">
                Demo veri yüklendi
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" />
            Tehlikeli Alan
          </CardTitle>
          <CardDescription>
            Tüm işlem ve bütçe verilerinizi kalıcı olarak silin. Bu işlem geri alınamaz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="w-4 h-4 mr-2" />
                Tüm verileri sil
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Emin misiniz?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bu işlem tüm işlemleri, bütçeleri ve kategori verilerini kalıcı olarak siler.
                  Bu işlem geri alınamaz.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAll}
                  className="bg-destructive hover:bg-destructive/90"
                  disabled={deleteAll.isPending}
                >
                  Evet, her şeyi sil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
