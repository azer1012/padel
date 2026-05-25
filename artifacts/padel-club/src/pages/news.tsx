import { useListNews } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function News() {
  const { data: response, isLoading } = useListNews();

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-black uppercase italic text-primary">Club News</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Stay up to date with the latest events and announcements.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-8">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="space-y-8">
            {response?.data?.map((article) => (
              <Card key={article.id} className="bg-card border-border overflow-hidden md:flex">
                {article.imageUrl && (
                  <div className="md:w-1/3 h-48 md:h-auto overflow-hidden bg-muted">
                    <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex-1">
                  <CardHeader>
                    <div className="flex items-center gap-4 mb-2">
                      <span className="text-xs text-primary font-medium">{article.category || 'News'}</span>
                      {article.publishedAt && (
                        <span className="text-xs text-muted-foreground">{format(new Date(article.publishedAt), "PPP")}</span>
                      )}
                    </div>
                    <CardTitle className="text-2xl font-bold">{article.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{article.excerpt || article.content.substring(0, 150) + '...'}</p>
                  </CardContent>
                </div>
              </Card>
            ))}
            {(!response?.data || response.data.length === 0) && (
               <div className="text-center py-12 text-muted-foreground">
                 No news articles available.
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}