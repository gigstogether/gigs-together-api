import { Module } from '@nestjs/common';
import { AlertingModule } from '../alerting/alerting.module';
import { CalendarService } from './calendar.service';
import { CALENDAR_PROVIDER } from './providers/calendar.provider';
import { GoogleCalendarProvider } from './providers/google-calendar/google-calendar.provider';

@Module({
  imports: [AlertingModule],
  providers: [
    CalendarService,
    {
      provide: CALENDAR_PROVIDER,
      useClass: GoogleCalendarProvider,
    },
  ],
  exports: [CalendarService],
})
export class CalendarModule {}
