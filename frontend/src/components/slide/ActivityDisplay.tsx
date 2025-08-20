// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { LearningActivity } from '@/lib/types/slide'
import { formatMaterial } from './utils'

interface ActivityDisplayProps {
  activity: LearningActivity
  index: number
  isWorkshop: boolean
  isTutorial: boolean
}

export function ActivityDisplay({ activity, index, isWorkshop, isTutorial }: ActivityDisplayProps) {
  return (
    <Card key={index}>
      <CardHeader>
        <div className="flex flex-col space-y-1">
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{activity.title}</CardTitle>
            <div className="flex gap-2">
              <Badge>{activity.type}</Badge>
              <Badge variant="outline">{activity.duration}</Badge>
            </div>
          </div>

          {isWorkshop && (
            <div className="mt-1 rounded-md border-l-2 border-primary bg-muted p-2 text-sm text-muted-foreground">
              <span className="font-medium">Facilitation Tip:</span> Ensure all participants are
              engaged. Consider rotating roles within groups to maximize participation.
            </div>
          )}

          {isTutorial && (
            <div className="mt-1 rounded-md border-l-2 border-primary bg-muted p-2 text-sm text-muted-foreground">
              <span className="font-medium">Learning Objective:</span> After completing this
              activity, students should be able to apply the concepts independently.
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-medium">Description:</h4>
          <p className="mt-1">{activity.description}</p>
        </div>

        <div>
          <h4 className="text-sm font-medium">Instructions:</h4>
          <ol className="mt-1 list-inside list-decimal space-y-1">
            {activity.instructions.map((instruction, instIndex) => (
              <li key={instIndex} className="pl-1">
                {typeof instruction === 'object' ? JSON.stringify(instruction) : instruction}
              </li>
            ))}
          </ol>
        </div>

        <div>
          <h4 className="text-sm font-medium">Materials Needed:</h4>
          <ul className="mt-1 list-inside list-disc space-y-1">
            {activity.materials.map((material, matIndex) => (
              <li key={matIndex} className="pl-1">
                {formatMaterial(material)}
              </li>
            ))}
          </ul>
        </div>

        {(isWorkshop || isTutorial) && (
          <div className="mt-4 border-t pt-4">
            <h4 className="text-sm font-medium">Reflection Questions:</h4>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li className="pl-1">
                How does this activity connect to the key concepts we&apos;ve learned?
              </li>
              <li className="pl-1">
                What challenges did you encounter and how did you overcome them?
              </li>
              <li className="pl-1">How might you apply these skills in a real-world context?</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
