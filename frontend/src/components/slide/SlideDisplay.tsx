import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LectureSlide } from '@/lib/types/slide'

interface SlideDisplayProps {
  slide: LectureSlide
  index: number
}

export function SlideDisplay({ slide, index }: SlideDisplayProps) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-muted/50">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{index + 1}</Badge>
          <CardTitle className="text-lg">{slide.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Slide Content:</h4>
            <ul className="list-disc space-y-2 pl-5">
              {slide.content.map((point, pointIndex) => (
                <li key={pointIndex}>
                  {typeof point === 'object' ? JSON.stringify(point) : point}
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Speaker Notes:</h4>
            <div className="rounded-md bg-muted p-3 text-sm">
              {typeof slide.notes === 'object' ? JSON.stringify(slide.notes) : slide.notes}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
