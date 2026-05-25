import { useListTerrains } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function Terrains() {
  const { data: terrains, isLoading } = useListTerrains();

  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-6xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-black uppercase italic text-primary">Our Courts</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience premium padel on our meticulously maintained indoor and outdoor courts.
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {terrains?.filter(t => t.isActive).map((terrain) => (
              <Card key={terrain.id} className="bg-card border-border overflow-hidden flex flex-col">
                <div className="h-48 overflow-hidden bg-muted">
                  <img 
                    src={terrain.type === 'indoor' ? '/src/assets/images/terrain-indoor.png' : '/src/assets/images/terrain-outdoor.png'} 
                    alt={terrain.name}
                    className="w-full h-full object-cover transition-transform hover:scale-105"
                  />
                </div>
                <CardHeader>
                  <CardTitle className="text-2xl font-bold uppercase">{terrain.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <p className="text-muted-foreground">{terrain.description}</p>
                    <div className="flex gap-2 mt-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary uppercase">
                        {terrain.type}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground uppercase">
                        Capacity: {terrain.capacity}
                      </span>
                    </div>
                  </div>
                  <Link href={`/reservations?terrainId=${terrain.id}`}>
                    <Button className="w-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 mt-4">
                      Check Availability
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}